'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { PageContainer, SectionBlock } from '@/components/ui/ExecutiveIntelligence';
import { useT } from '@/lib/i18n/useT';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return toLocalDateString(d);
}

/** YYYY-MM-DD for the boutique calendar (Asia/Riyadh), same as ledger API day keys. */
function riyadhCalendarToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function newClientRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Line = { id: string; employeeId: string; amountSar: number; source: string };
type Summary = {
  id: string | null;
  boutiqueId: string;
  boutique: { id: string; code: string; name: string };
  date: string;
  totalSar: number;
  status: string;
  linesTotal: number;
  diff: number;
  canLock: boolean;
  lines: Line[];
};

type DailyData = {
  date: string;
  scope: { boutiqueIds: string[]; label: string };
  summaries: Summary[];
};

type EmployeeOption = { empId: string; name: string };

type DraftLine = {
  clientRowId: string;
  serverLineId: string | null;
  employeeId: string;
  amountStr: string;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
};

type RowFieldError = { employee?: string; amount?: string };

function parseAmountInt(raw: string): { ok: true; value: number } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: false };
  if (!/^\d+$/.test(t)) return { ok: false };
  const value = parseInt(t, 10);
  if (!Number.isInteger(value) || value < 0) return { ok: false };
  return { ok: true, value };
}

function isRowEmpty(d: DraftLine): boolean {
  return d.employeeId.trim() === '' && d.amountStr.trim() === '';
}

function isRowComplete(d: DraftLine): boolean {
  if (d.employeeId.trim() === '') return false;
  const p = parseAmountInt(d.amountStr);
  return p.ok;
}

function linesToDrafts(lines: Line[], locked: boolean): DraftLine[] {
  const drafts: DraftLine[] = lines.map((l) => ({
    clientRowId: l.id,
    serverLineId: l.id,
    employeeId: l.employeeId,
    amountStr: String(l.amountSar),
    dirty: false,
    saveState: 'idle',
  }));
  if (!locked) {
    drafts.push({
      clientRowId: newClientRowId(),
      serverLineId: null,
      employeeId: '',
      amountStr: '',
      dirty: false,
      saveState: 'idle',
    });
  }
  return drafts;
}

function initDraftsFromSummaries(summaries: Summary[]): Record<string, DraftLine[]> {
  const out: Record<string, DraftLine[]> = {};
  for (const s of summaries) {
    out[s.boutiqueId] = linesToDrafts(s.lines, s.status === 'LOCKED');
  }
  return out;
}

/** After editing, append one blank row when the last row is fully filled (Excel-style). */
function maintainTrailingBlank(rows: DraftLine[], locked: boolean): DraftLine[] {
  if (locked) return rows;
  const out = [...rows];
  if (out.length === 0) {
    out.push({
      clientRowId: newClientRowId(),
      serverLineId: null,
      employeeId: '',
      amountStr: '',
      dirty: false,
      saveState: 'idle',
    });
    return out;
  }
  const last = out[out.length - 1];
  if (isRowComplete(last)) {
    out.push({
      clientRowId: newClientRowId(),
      serverLineId: null,
      employeeId: '',
      amountStr: '',
      dirty: false,
      saveState: 'idle',
    });
  }
  return out;
}

function validateDraftRow(
  d: DraftLine,
  rows: DraftLine[],
  selfIndex: number
): RowFieldError {
  const err: RowFieldError = {};
  if (isRowEmpty(d)) return err;
  if (!d.employeeId.trim()) err.employee = 'Required';
  const am = parseAmountInt(d.amountStr);
  if (!am.ok) err.amount = 'Integer ≥ 0 required';
  if (d.employeeId.trim()) {
    const dup = rows.findIndex(
      (r, i) => i !== selfIndex && r.employeeId.trim() === d.employeeId.trim()
    );
    if (dup >= 0) err.employee = 'Duplicate employee for this day';
  }
  return err;
}

type LinesPostOk = {
  ok: true;
  linesTotal: number;
  summaryTotal: number;
  diff: number;
  canLock: boolean;
  status: string;
};

function upsertLocalLine(lines: Line[], employeeId: string, amountSar: number, serverLineId: string | null): Line[] {
  const idx = lines.findIndex((l) => l.employeeId === employeeId);
  if (idx >= 0) {
    const copy = [...lines];
    copy[idx] = { ...copy[idx], amountSar };
    return copy;
  }
  const id = serverLineId ?? `local:${employeeId}`;
  return [...lines, { id, employeeId, amountSar, source: 'MANUAL' }];
}

function formatSarLine(n: number): string {
  return `${n.toLocaleString('en-SA')} SAR`;
}

type ScopeBoutiqueDailyMetrics = {
  boutiqueId: string;
  dailyRequiredSar: number;
  todayAchievedSar: number;
  todayPct: number | null;
  dailyProgressPending: boolean;
};

function formatDailySummaryForCopy(
  summaries: Summary[],
  dateStr: string,
  scopeDaily: ScopeBoutiqueDailyMetrics | null,
  labels: { todaySales: string; dailyTarget: string; achievement: string; unavailable: string }
): string {
  const blocks: string[] = [];
  for (const s of summaries) {
    const useScopeMetrics = scopeDaily != null && scopeDaily.boutiqueId === s.boutiqueId;
    const todaySalesSar = useScopeMetrics ? scopeDaily.todayAchievedSar : s.linesTotal;
    const dailyTargetSar: number | null = useScopeMetrics ? scopeDaily.dailyRequiredSar : null;
    let achievementPct: number | null = null;
    if (useScopeMetrics) {
      if (scopeDaily.dailyProgressPending) {
        achievementPct = 0;
      } else if (scopeDaily.todayPct !== null && scopeDaily.todayPct !== undefined) {
        achievementPct = scopeDaily.todayPct;
      } else {
        achievementPct = 0;
      }
    }

    const lines: string[] = [];
    lines.push(s.boutique.name);
    lines.push(dateStr);
    lines.push('');
    lines.push(`${labels.todaySales} ${formatSarLine(todaySalesSar)}`);
    if (dailyTargetSar !== null) {
      lines.push(`${labels.dailyTarget} ${formatSarLine(dailyTargetSar)}`);
    } else {
      lines.push(`${labels.dailyTarget} ${labels.unavailable}`);
    }
    if (achievementPct !== null) {
      lines.push(`${labels.achievement} ${achievementPct}%`);
    } else {
      lines.push(`${labels.achievement} ${labels.unavailable}`);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

export function SalesDailyClient({
  embedded = false,
  canAdminUnlockLedger = false,
}: {
  embedded?: boolean;
  /** ADMIN / SUPER_ADMIN: show Unlock when the day is ledger-locked. */
  canAdminUnlockLedger?: boolean;
} = {}) {
  const { t } = useT();
  const [date, setDate] = useState(riyadhCalendarToday);
  const [data, setData] = useState<DailyData | null>(null);
  const [draftsByBoutique, setDraftsByBoutique] = useState<Record<string, DraftLine[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSummary, setSavingSummary] = useState<string | null>(null);
  const [locking, setLocking] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [deletingClientRowId, setDeletingClientRowId] = useState<string | null>(null);
  const [batchSavingBoutique, setBatchSavingBoutique] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoadFailed, setEmployeesLoadFailed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'ok' | 'err'>('idle');
  const [scopeBoutiqueDaily, setScopeBoutiqueDaily] = useState<ScopeBoutiqueDailyMetrics | null>(null);

  const [yearlyFile, setYearlyFile] = useState<File | null>(null);
  const [yearlyMonth, setYearlyMonth] = useState('');
  const [yearlyDryRun, setYearlyDryRun] = useState(true);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyResult, setYearlyResult] = useState<{
    dryRun: boolean;
    daysAffected?: string[];
    unmappedEmpIds?: string[];
    skippedEmpty?: number;
    skippedDash?: number;
    inserted?: number;
    updated?: number;
    rowsQueued?: number;
    perDateSummary?: {
      date: string;
      linesTotalBefore?: number;
      linesTotalAfter?: number;
      insertedLinesCount: number;
      updatedLinesCount: number;
      skippedEmptyCount: number;
      linesTotalSar: number;
      managerTotalSar: number;
      diffSar: number;
    }[];
    errors?: { row: number; col: number; header: string; rawValue: unknown; reason: string }[];
    error?: string;
  } | null>(null);
  const yearlyFileInputRef = useRef<HTMLInputElement>(null);

  function getCurrentMonthRiyadh(): string {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    return `${year}-${month}`;
  }

  const [coverageMonth, setCoverageMonth] = useState('');
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageResult, setCoverageResult] = useState<{
    scopeId?: string;
    month?: string;
    maxSalesGapDays?: number;
    expectedDaysCountTotal?: number;
    recordedCountTotal?: number;
    completenessPct?: number;
    byEmployee?: Array<{
      employeeId: string;
      name: string;
      expectedDaysCount?: number;
      recordedDaysCount?: number;
      missingDaysCount?: number;
      flaggedGapsCount?: number;
      expectedDays?: string[];
      missingDays?: string[];
      flaggedGaps?: Array<{ from: string; to: string; expectedMissingCount: number }>;
    }>;
    byDate?: Array<{
      date: string;
      expectedEmployees: string[];
      recordedEmployees: string[];
      missingEmployees: string[];
      isFlaggedDate: boolean;
    }>;
    error?: string;
  } | null>(null);

  const firstTableInputRef = useRef<HTMLSelectElement | null>(null);
  const batchSaveLockedRef = useRef(false);

  /** Confirmation only when entering sales for a calendar day before today (Asia/Riyadh), not for today or future days. */
  const salesCalendarToday = riyadhCalendarToday();
  const dateIsBeforeToday = date < salesCalendarToday;
  const [pastDateAck, setPastDateAck] = useState(false);
  const persistBlocked = dateIsBeforeToday && !pastDateAck;

  useEffect(() => {
    setPastDateAck(false);
  }, [date]);

  const loadDaily = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/sales/daily?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d.error) {
        setData(null);
        setDraftsByBoutique({});
        setLoadError(d.error ?? 'Failed to load');
      } else {
        setData(d as DailyData);
        setDraftsByBoutique(initDraftsFromSummaries((d as DailyData).summaries ?? []));
        setLoadError(null);
      }
    } catch {
      setData(null);
      setDraftsByBoutique({});
      setLoadError('Request failed');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadDaily();
  }, [loadDaily]);

  const coverageMonthFromDate = date.slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    setEmployeesLoadFailed(false);
    fetch(`/api/sales/coverage?month=${encodeURIComponent(coverageMonthFromDate)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setEmployees([]);
          setEmployeesLoadFailed(true);
          return;
        }
        const list = Array.isArray(j.byEmployee) ? j.byEmployee : [];
        setEmployees(
          list.map((e: { employeeId: string; name: string }) => ({
            empId: e.employeeId,
            name: e.name,
          }))
        );
        setEmployeesLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([]);
          setEmployeesLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coverageMonthFromDate]);

  useEffect(() => {
    let cancelled = false;
    const month = date.slice(0, 7);
    fetch(
      `/api/target/boutique/daily?month=${encodeURIComponent(month)}&date=${encodeURIComponent(date)}`,
      { cache: 'no-store' }
    )
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !j.boutiqueId) {
          setScopeBoutiqueDaily(null);
          return;
        }
        const pctRaw = j.todayPct;
        const todayPct =
          typeof pctRaw === 'number' && Number.isFinite(pctRaw) ? Math.trunc(pctRaw) : null;
        setScopeBoutiqueDaily({
          boutiqueId: j.boutiqueId as string,
          dailyRequiredSar: Math.trunc(Number(j.dailyRequiredSar) || 0),
          todayAchievedSar: Math.trunc(Number(j.todayAchievedSar) || 0),
          todayPct,
          dailyProgressPending: !!j.dailyProgressPending,
        });
      })
      .catch(() => {
        if (!cancelled) setScopeBoutiqueDaily(null);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    if (coverageMonth === '') setCoverageMonth(getCurrentMonthRiyadh());
  }, [coverageMonth]);

  useEffect(() => {
    if (loading || !data || data.summaries.length === 0) return;
    const t = window.setTimeout(() => {
      firstTableInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [loading, data, date]);

  const nameByEmpId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.empId, e.name);
    return m;
  }, [employees]);

  const dailySummaryCopyText = useMemo(() => {
    if (!data?.summaries?.length) return '';
    const dateStr = data.date || date;
    return formatDailySummaryForCopy(data.summaries, dateStr, scopeBoutiqueDaily, {
      todaySales: t('sales.dailyLedger.copyLabelTodaySales'),
      dailyTarget: t('sales.dailyLedger.copyLabelDailyTarget'),
      achievement: t('sales.dailyLedger.copyLabelAchievement'),
      unavailable: t('sales.dailyLedger.copyValueUnavailable'),
    });
  }, [data, date, scopeBoutiqueDaily, t]);

  const hasUnsavedLedgerRows = useMemo(
    () =>
      Object.values(draftsByBoutique).some((rows) =>
        rows.some((r) => r.dirty && !isRowEmpty(r))
      ),
    [draftsByBoutique]
  );

  const handleCopyDailySummary = async () => {
    if (!dailySummaryCopyText.trim()) return;
    try {
      await navigator.clipboard.writeText(dailySummaryCopyText);
      setCopyFeedback('ok');
      window.setTimeout(() => setCopyFeedback('idle'), 2000);
    } catch {
      setCopyFeedback('err');
      window.setTimeout(() => setCopyFeedback('idle'), 2500);
    }
  };

  const refetchFull = useCallback(async () => {
    await loadDaily();
  }, [loadDaily]);

  const setManagerTotal = async (boutiqueId: string, totalSar: number) => {
    if (persistBlocked) {
      setActionError(t('sales.dailyLedger.confirmDateFirst'));
      return;
    }
    setSavingSummary(boutiqueId);
    setActionError(null);
    try {
      const res = await fetch('/api/sales/daily/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date, totalSar }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.summary) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summaries: prev.summaries.map((s) =>
              s.boutiqueId === boutiqueId
                ? {
                    ...s,
                    id: j.summary.id ?? s.id,
                    totalSar: j.summary.totalSar,
                    status: j.summary.status,
                    linesTotal: j.summary.linesTotal,
                    diff: j.summary.diff,
                    canLock: j.summary.status === 'DRAFT' && j.summary.diff === 0,
                  }
                : s
            ),
          };
        });
      } else {
        setActionError((j as { error?: string }).error ?? 'Failed to save manager total');
      }
    } finally {
      setSavingSummary(null);
    }
  };

  const applyLineSuccessToState = useCallback(
    (boutiqueId: string, employeeId: string, amountSar: number, lineId: string | null, j: LinesPostOk) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          summaries: prev.summaries.map((s) => {
            if (s.boutiqueId !== boutiqueId) return s;
            const nextLines = upsertLocalLine(s.lines, employeeId, amountSar, lineId);
            return {
              ...s,
              lines: nextLines,
              linesTotal: j.linesTotal,
              diff: j.diff,
              canLock: j.canLock,
              status: j.status,
            };
          }),
        };
      });
    },
    []
  );

  const saveAllLines = async (boutiqueId: string, rows: DraftLine[]) => {
    if (persistBlocked) {
      setActionError(t('sales.dailyLedger.confirmDateFirst'));
      return;
    }
    if (batchSavingBoutique || batchSaveLockedRef.current) return;
    batchSaveLockedRef.current = true;
    setBatchSavingBoutique(boutiqueId);
    setActionError(null);

    try {
    const dirtyRows = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.dirty && !isRowEmpty(r));

    if (dirtyRows.length === 0) {
      return;
    }

    let firstErr: string | null = null;
    for (const { r, i } of dirtyRows) {
      const fieldErr = validateDraftRow(r, rows, i);
      if (fieldErr.employee || fieldErr.amount) {
        firstErr = 'Fix row errors before saving';
        setDraftsByBoutique((prev) => ({
          ...prev,
          [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
            row.clientRowId === r.clientRowId ? { ...row, saveState: 'error' as const } : row
          ),
        }));
        continue;
      }
      const amt = parseAmountInt(r.amountStr);
      if (!amt.ok) continue;
      setDraftsByBoutique((prev) => ({
        ...prev,
        [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
          row.clientRowId === r.clientRowId ? { ...row, saveState: 'saving' as const } : row
        ),
      }));
      try {
        const res = await fetch('/api/sales/daily/lines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boutiqueId,
            date,
            employeeId: r.employeeId.trim(),
            amountSar: amt.value,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && (j as LinesPostOk).ok) {
          const ok = j as LinesPostOk;
          applyLineSuccessToState(boutiqueId, r.employeeId.trim(), amt.value, r.serverLineId, ok);
          setDraftsByBoutique((prev) => ({
            ...prev,
            [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
              row.clientRowId === r.clientRowId
                ? { ...row, dirty: false, saveState: 'saved' as const }
                : row
            ),
          }));
        } else {
          firstErr = (j as { error?: string }).error ?? 'Failed to save line';
          setDraftsByBoutique((prev) => ({
            ...prev,
            [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
              row.clientRowId === r.clientRowId ? { ...row, saveState: 'error' as const } : row
            ),
          }));
        }
      } catch {
        firstErr = 'Request failed';
        setDraftsByBoutique((prev) => ({
          ...prev,
          [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
            row.clientRowId === r.clientRowId ? { ...row, saveState: 'error' as const } : row
          ),
        }));
      }
    }

    if (firstErr) setActionError(firstErr);

    setDraftsByBoutique((prev) => ({
      ...prev,
      [boutiqueId]: (prev[boutiqueId] ?? []).map((row) =>
        row.saveState === 'saved' ? { ...row, saveState: 'idle' as const } : row
      ),
    }));
    } finally {
      batchSaveLockedRef.current = false;
      setBatchSavingBoutique(null);
    }
  };

  const lock = async (boutiqueId: string) => {
    if (persistBlocked) {
      setActionError(t('sales.dailyLedger.confirmDateFirst'));
      return;
    }
    setLocking(boutiqueId);
    setActionError(null);
    try {
      const res = await fetch('/api/sales/daily/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summaries: prev.summaries.map((s) =>
              s.boutiqueId === boutiqueId
                ? { ...s, status: 'LOCKED', canLock: false }
                : s
            ),
          };
        });
        setDraftsByBoutique((prev) => {
          const rows = prev[boutiqueId];
          if (!rows) return prev;
          const asLines: Line[] = rows
            .filter((d) => d.employeeId.trim() !== '')
            .map((d) => {
              const amt = parseAmountInt(d.amountStr);
              return {
                id: d.serverLineId ?? `local:${d.employeeId.trim()}`,
                employeeId: d.employeeId.trim(),
                amountSar: amt.ok ? amt.value : 0,
                source: 'MANUAL',
              };
            });
          return { ...prev, [boutiqueId]: linesToDrafts(asLines, true) };
        });
      } else {
        setActionError((j as { error?: string }).error ?? 'Failed to lock');
      }
    } finally {
      setLocking(null);
    }
  };

  const unlock = async (boutiqueId: string) => {
    setUnlocking(boutiqueId);
    setActionError(null);
    try {
      const res = await fetch('/api/sales/daily/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const canLock = typeof (j as { canLock?: boolean }).canLock === 'boolean' ? (j as { canLock: boolean }).canLock : false;
        const linesTotal = typeof (j as { linesTotal?: number }).linesTotal === 'number' ? (j as { linesTotal: number }).linesTotal : undefined;
        const diff = typeof (j as { diff?: number }).diff === 'number' ? (j as { diff: number }).diff : undefined;
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summaries: prev.summaries.map((s) =>
              s.boutiqueId === boutiqueId
                ? {
                    ...s,
                    status: 'DRAFT',
                    canLock,
                    linesTotal: linesTotal ?? s.linesTotal,
                    diff: diff ?? s.diff,
                  }
                : s
            ),
          };
        });
        setDraftsByBoutique((prev) => {
          const rows = prev[boutiqueId];
          if (!rows) return prev;
          const asLines: Line[] = rows
            .filter((d) => d.employeeId.trim() !== '')
            .map((d) => {
              const amt = parseAmountInt(d.amountStr);
              return {
                id: d.serverLineId ?? `local:${d.employeeId.trim()}`,
                employeeId: d.employeeId.trim(),
                amountSar: amt.ok ? amt.value : 0,
                source: 'MANUAL',
              };
            });
          return { ...prev, [boutiqueId]: linesToDrafts(asLines, false) };
        });
      } else {
        setActionError((j as { error?: string }).error ?? 'Failed to unlock');
      }
    } finally {
      setUnlocking(null);
    }
  };

  const runYearlyImport = async () => {
    if (!yearlyFile) return;
    setYearlyLoading(true);
    setYearlyResult(null);
    try {
      const form = new FormData();
      form.set('file', yearlyFile);
      form.set('dryRun', yearlyDryRun ? '1' : '0');
      if (yearlyMonth.trim()) form.set('month', yearlyMonth.trim());
      const res = await fetch('/api/sales/import/yearly', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) {
        setYearlyResult({
          dryRun: yearlyDryRun,
          error: j.error ?? 'Import failed',
          errors: j.errors,
        });
        return;
      }
      setYearlyResult({
        dryRun: j.dryRun ?? yearlyDryRun,
        daysAffected: j.daysAffected,
        unmappedEmpIds: j.unmappedEmpIds,
        skippedEmpty: j.skippedEmpty,
        skippedDash: j.skippedDash,
        inserted: j.inserted,
        updated: j.updated,
        rowsQueued: j.rowsQueued,
        perDateSummary: j.perDateSummary,
        errors: j.errors,
      });
      if (!yearlyDryRun) void refetchFull();
    } catch {
      setYearlyResult({ dryRun: yearlyDryRun, error: 'Request failed' });
    } finally {
      setYearlyLoading(false);
      setYearlyDryRun(true);
    }
  };

  const loadCoverage = async () => {
    if (!coverageMonth.trim()) return;
    setCoverageLoading(true);
    setCoverageResult(null);
    try {
      const res = await fetch(`/api/sales/coverage?month=${encodeURIComponent(coverageMonth.trim())}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) {
        setCoverageResult({ error: j.error ?? 'Failed to load coverage' });
        return;
      }
      setCoverageResult({
        scopeId: j.scopeId,
        month: j.month,
        maxSalesGapDays: j.maxSalesGapDays,
        expectedDaysCountTotal: j.expectedDaysCountTotal,
        recordedCountTotal: j.recordedCountTotal,
        completenessPct: j.completenessPct,
        byEmployee: (j.byEmployee ?? []).map((e: { employeeId: string; name: string; expectedDays: string[]; recordedDays: string[]; missingDays: string[]; flaggedGaps: Array<{ from: string; to: string; expectedMissingCount: number }> }) => ({
          employeeId: e.employeeId,
          name: e.name,
          expectedDaysCount: e.expectedDays?.length ?? 0,
          recordedDaysCount: e.recordedDays?.length ?? 0,
          missingDaysCount: e.missingDays?.length ?? 0,
          flaggedGapsCount: e.flaggedGaps?.length ?? 0,
          expectedDays: e.expectedDays,
          missingDays: e.missingDays,
          flaggedGaps: e.flaggedGaps,
        })),
        byDate: j.byDate,
      });
    } catch {
      setCoverageResult({ error: 'Request failed' });
    } finally {
      setCoverageLoading(false);
    }
  };

  const diffClass = (d: number) =>
    d === 0 ? 'text-green-700' : d >= 1 ? 'text-amber-700' : 'text-red-700';
  const diffText = (d: number) => (d === 0 ? '0' : d >= 1 ? `+${d}` : d);

  const updateDraftRow = (boutiqueId: string, clientRowId: string, patch: Partial<DraftLine>) => {
    setDraftsByBoutique((prev) => {
      const rows = [...(prev[boutiqueId] ?? [])];
      const idx = rows.findIndex((x) => x.clientRowId === clientRowId);
      if (idx < 0) return prev;
      rows[idx] = { ...rows[idx], ...patch, dirty: true };
      const locked =
        data?.summaries.find((s) => s.boutiqueId === boutiqueId)?.status === 'LOCKED';
      const next = maintainTrailingBlank(rows, !!locked);
      return { ...prev, [boutiqueId]: next };
    });
  };

  const zeroDraftAmount = (boutiqueId: string, clientRowId: string) => {
    if (persistBlocked) {
      setActionError(t('sales.dailyLedger.confirmDateFirst'));
      return;
    }
    updateDraftRow(boutiqueId, clientRowId, { amountStr: '0' });
  };

  const removeLedgerLine = async (boutiqueId: string, row: DraftLine, summaryLocked: boolean) => {
    if (summaryLocked) return;
    if (persistBlocked) {
      setActionError(t('sales.dailyLedger.confirmDateFirst'));
      return;
    }
    const emp = row.employeeId.trim();
    if (!row.serverLineId) {
      if (isRowEmpty(row)) return;
      setDraftsByBoutique((prev) => {
        const rows = [...(prev[boutiqueId] ?? [])];
        const idx = rows.findIndex((x) => x.clientRowId === row.clientRowId);
        if (idx < 0) return prev;
        rows[idx] = {
          ...rows[idx],
          employeeId: '',
          amountStr: '',
          dirty: false,
          saveState: 'idle',
          serverLineId: null,
        };
        const lockedNow = data?.summaries.find((s) => s.boutiqueId === boutiqueId)?.status === 'LOCKED';
        return { ...prev, [boutiqueId]: maintainTrailingBlank(rows, !!lockedNow) };
      });
      return;
    }
    if (!emp) return;
    setDeletingClientRowId(row.clientRowId);
    setActionError(null);
    try {
      const res = await fetch('/api/sales/daily/lines', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutiqueId, date, employeeId: emp }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadDaily({ silent: true });
      } else {
        setActionError((j as { error?: string }).error ?? 'Failed to remove line');
      }
    } finally {
      setDeletingClientRowId(null);
    }
  };

  const mainInner = (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDate(addDays(date, -1))}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-subtle"
          >
            ← Prev
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            aria-label={t('sales.dailyLedger.salesDate')}
          />
          <button
            type="button"
            onClick={() => setDate(addDays(date, 1))}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-subtle"
          >
            Next →
          </button>
          <button
            type="button"
            onClick={() => setDate(riyadhCalendarToday())}
            className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/15"
          >
            {t('sales.dailyLedger.jumpToToday')} ({salesCalendarToday})
          </button>
        </div>
        {data?.scope?.label && (
          <span className="rounded bg-surface-subtle px-2 py-1 text-sm text-foreground">
            Scope: {data.scope.label}
          </span>
        )}
      </div>

      {dateIsBeforeToday && (
        <div
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">{t('sales.dailyLedger.pastDateBanner')}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-amber-950">{date}</p>
          <p className="mt-1 text-xs text-amber-900/90">{t('sales.dailyLedger.pastDateHint')}</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={pastDateAck}
              onChange={(e) => setPastDateAck(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-amber-400"
            />
            <span>{t('sales.dailyLedger.pastDateConfirmCheckbox')}</span>
          </label>
        </div>
      )}

      {loadError && !loading && (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
          aria-live="assertive"
        >
          {loadError}
        </div>
      )}

      {actionError && (
        <div
          className="mb-4 flex min-w-0 flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
          aria-live="polite"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded border border-amber-300 bg-surface px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <OpsCard className="mb-6">
        <h3 className="mb-1 border-b border-border pb-2 text-sm font-medium text-foreground">
          {t('sales.dailyLedger.dailyEntrySection')}
        </h3>
        <p className="mb-4 text-xs text-muted">{t('sales.dailyLedger.dailyEntryHint')}</p>
        {employeesLoadFailed && (
          <p className="mb-3 text-xs text-amber-800">{t('sales.dailyLedger.employeeListFallback')}</p>
        )}
        {loading && <p className="text-muted">Loading…</p>}
        {!loading && data?.summaries?.length === 0 && (
          <p className="text-muted">No summaries for this date. Set manager total per boutique below.</p>
        )}
        {!loading &&
          data?.summaries?.map((s, sIdx) => {
            const rows = draftsByBoutique[s.boutiqueId] ?? linesToDrafts(s.lines, s.status === 'LOCKED');
            const locked = s.status === 'LOCKED';
            const dirtyCount = rows.filter((r) => r.dirty && !isRowEmpty(r)).length;
            return (
              <div key={s.boutiqueId} className={sIdx > 0 ? 'mt-8 border-t border-border pt-8' : ''}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <h2 className="font-medium text-foreground">
                    {s.boutique.name} ({s.boutique.code})
                  </h2>
                  <span
                    className={
                      s.status === 'LOCKED'
                        ? 'rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-800'
                        : 'rounded bg-surface-subtle px-2 py-0.5 text-sm text-foreground'
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="text-xs text-muted">Manager total (SAR)</label>
                    <ManagerTotalInput
                      summary={s}
                      saving={savingSummary === s.boutiqueId}
                      persistDisabled={persistBlocked}
                      onSave={(v) => void setManagerTotal(s.boutiqueId, v)}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted">Lines total (SAR)</p>
                    <p className="font-mono text-foreground">{s.linesTotal.toLocaleString('en-SA')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Diff</p>
                    <p className={`font-mono ${diffClass(s.diff)}`}>{diffText(s.diff)}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      disabled={
                        locked ||
                        dirtyCount === 0 ||
                        batchSavingBoutique === s.boutiqueId ||
                        persistBlocked
                      }
                      onClick={() => void saveAllLines(s.boutiqueId, rows)}
                      className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {batchSavingBoutique === s.boutiqueId
                        ? t('sales.dailyLedger.saving')
                        : t('sales.dailyLedger.saveAll')}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !s.canLock ||
                        locking === s.boutiqueId ||
                        dirtyCount > 0 ||
                        persistBlocked
                      }
                      onClick={() => void lock(s.boutiqueId)}
                      className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-subtle disabled:opacity-50"
                      title={dirtyCount > 0 ? t('sales.dailyLedger.saveBeforeLock') : undefined}
                    >
                      {locking === s.boutiqueId ? t('sales.dailyLedger.locking') : t('sales.dailyLedger.lock')}
                    </button>
                    {canAdminUnlockLedger && locked ? (
                      <button
                        type="button"
                        disabled={unlocking === s.boutiqueId || locking === s.boutiqueId}
                        onClick={() => void unlock(s.boutiqueId)}
                        className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        title={t('sales.dailyLedger.unlockAdminHint')}
                      >
                        {unlocking === s.boutiqueId ? t('sales.dailyLedger.unlocking') : t('sales.dailyLedger.unlockAdmin')}
                      </button>
                    ) : null}
                  </div>
                </div>
                {dirtyCount > 0 && !locked && (
                  <p className="mb-2 text-xs text-amber-800">{`${dirtyCount} unsaved row(s)`}</p>
                )}
                {s.diff !== 0 && (
                  <p className="mb-2 text-sm text-amber-700">
                    {t('targets.cannotLockUntilDiffZero') ?? 'Cannot lock until lines total equals manager total (diff = 0).'}
                  </p>
                )}
                <LedgerTable
                  boutiqueId={s.boutiqueId}
                  rows={rows}
                  employees={employees}
                  nameByEmpId={nameByEmpId}
                  locked={locked}
                  batchSaving={batchSavingBoutique === s.boutiqueId}
                  persistBlocked={persistBlocked}
                  deletingClientRowId={deletingClientRowId}
                  firstSelectRef={sIdx === 0 ? firstTableInputRef : undefined}
                  employeePlaceholder={t('sales.dailyLedger.chooseEmployee')}
                  employeeEmpty={t('sales.dailyLedger.noEmployeesLoaded')}
                  actionsColumnLabel={t('sales.dailyLedger.actionsColumn')}
                  removeLineLabel={t('sales.dailyLedger.removeLine')}
                  zeroAmountLabel={t('sales.dailyLedger.zeroAmount')}
                  onUpdateRow={(clientRowId, patch) => updateDraftRow(s.boutiqueId, clientRowId, patch)}
                  onRemoveRow={(row) => void removeLedgerLine(s.boutiqueId, row, locked)}
                  onZeroAmount={(clientRowId) => zeroDraftAmount(s.boutiqueId, clientRowId)}
                  onEnterFromAmount={(rowIndex) => {
                    const nextEmp = document.querySelector<HTMLSelectElement>(
                      `[data-ledger-emp="${s.boutiqueId}-${rowIndex + 1}"]`
                    );
                    nextEmp?.focus();
                  }}
                />
              </div>
            );
          })}
      </OpsCard>

      <OpsCard className="mb-6">
        <h3 className="mb-1 border-b border-border pb-2 text-sm font-medium text-foreground">
          {t('sales.dailyLedger.copyDailySummary')}
        </h3>
        <p className="mb-3 text-xs text-muted">{t('sales.dailyLedger.copyDailySummaryHint')}</p>
        {hasUnsavedLedgerRows ? (
          <p className="mb-2 text-xs text-amber-800">{t('sales.dailyLedger.copySummaryUnsavedNote')}</p>
        ) : null}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading || !dailySummaryCopyText.trim()}
            onClick={() => void handleCopyDailySummary()}
            className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {t('sales.dailyLedger.copyToClipboard')}
          </button>
          {copyFeedback === 'ok' ? (
            <span className="text-xs text-green-700">{t('sales.dailyLedger.copied')}</span>
          ) : copyFeedback === 'err' ? (
            <span className="text-xs text-red-600">{t('sales.dailyLedger.copyFailed')}</span>
          ) : null}
        </div>
        <textarea
          readOnly
          value={
            dailySummaryCopyText.trim()
              ? dailySummaryCopyText
              : loading
                ? '…'
                : t('sales.dailyLedger.copySummaryEmpty')
          }
          dir="ltr"
          rows={10}
          className="w-full resize-y rounded border border-border bg-surface-subtle px-3 py-2 font-mono text-xs text-foreground"
          aria-label={t('sales.dailyLedger.copyDailySummary')}
        />
      </OpsCard>

      <OpsCard className="mb-6">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="mb-2 flex w-full items-center justify-between gap-2 border-b border-border pb-2 text-start text-sm font-medium text-foreground"
          aria-expanded={advancedOpen}
        >
          <span>{t('sales.dailyLedger.advancedSection')}</span>
          <span className="text-muted">{advancedOpen ? '▾' : '▸'}</span>
        </button>
        {advancedOpen && (
          <div className="space-y-8 pt-2">
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {t('sales.dailyLedger.yearlyImportHeading')}
              </h4>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <input
                  ref={yearlyFileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setYearlyFile(f ?? null);
                    setYearlyResult(null);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => yearlyFileInputRef.current?.click()}
                  className="w-full min-w-0 rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-subtle sm:w-auto"
                >
                  {yearlyFile ? yearlyFile.name : 'Choose file'}
                </button>
                <div className="min-w-0">
                  <label className="me-1 text-xs text-muted">Month (optional)</label>
                  <input
                    type="text"
                    placeholder="YYYY-MM"
                    value={yearlyMonth}
                    onChange={(e) => setYearlyMonth(e.target.value)}
                    className="w-full min-w-0 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground sm:w-28"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <input type="checkbox" checked={yearlyDryRun} onChange={(e) => setYearlyDryRun(e.target.checked)} />
                  Dry run
                </label>
                <button
                  type="button"
                  disabled={!yearlyFile || yearlyLoading}
                  onClick={() => void runYearlyImport()}
                  className="w-full rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50 sm:w-auto"
                >
                  {yearlyLoading ? '…' : yearlyDryRun ? 'Preview (Dry Run)' : 'Import Now'}
                </button>
              </div>
              {!yearlyDryRun && (
                <p className="mt-2 text-xs text-amber-700">
                  Import will write to database. Keep Dry Run ON to preview.
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                If manager total is 0, import will auto-set it to lines total.
              </p>
              {yearlyResult && (
                <>
                  <pre className="mt-3 max-h-48 overflow-auto rounded border border-border bg-surface-subtle p-2 text-xs text-foreground">
                    {yearlyResult.error
                      ? yearlyResult.errors?.length
                        ? `${yearlyResult.error}\n\n${JSON.stringify(yearlyResult.errors, null, 2)}`
                        : yearlyResult.error
                      : JSON.stringify(
                          {
                            daysAffected: yearlyResult.daysAffected,
                            unmappedEmpIds: yearlyResult.unmappedEmpIds,
                            skippedEmpty: yearlyResult.skippedEmpty,
                            skippedDash: yearlyResult.skippedDash,
                            inserted: yearlyResult.inserted,
                            updated: yearlyResult.updated,
                            rowsQueued: yearlyResult.rowsQueued,
                            perDateSummary: yearlyResult.perDateSummary,
                          },
                          null,
                          2
                        )}
                  </pre>
                  {!yearlyResult.error && yearlyResult.perDateSummary && yearlyResult.perDateSummary.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-0 border-collapse text-xs text-foreground">
                        <thead>
                          <tr className="border-b border-border text-start font-medium text-muted">
                            <th className="py-1.5 pe-2">Date</th>
                            <th className="py-1.5 pe-2 text-end">Inserted</th>
                            <th className="py-1.5 pe-2 text-end">Updated</th>
                            <th className="py-1.5 pe-2 text-end">Skipped</th>
                            <th className="py-1.5 pe-2 text-end">Lines total</th>
                            <th className="py-1.5 pe-2 text-end">Manager total</th>
                            <th className="py-1.5 pe-2 text-end">Diff</th>
                            <th className="w-0 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {yearlyResult.perDateSummary.map((row) => (
                            <tr key={row.date} className="border-b border-border">
                              <td className="py-1.5 pe-2 font-mono">{row.date}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.insertedLinesCount}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.updatedLinesCount}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.skippedEmptyCount}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.linesTotalSar.toLocaleString('en-SA')}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.managerTotalSar.toLocaleString('en-SA')}</td>
                              <td className="py-1.5 pe-2 text-end font-mono">{row.diffSar.toLocaleString('en-SA')}</td>
                              <td className="py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDate(row.date)}
                                  className="rounded border border-border bg-surface px-2 py-0.5 text-foreground hover:bg-surface-subtle"
                                >
                                  {t('sales.dailyLedger.jumpToDate')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {t('sales.dailyLedger.coverageHeading')}
              </h4>
              <p className="mb-2 text-xs text-muted">
                Expected days = scheduled (not off, not leave). Missing only flagged when consecutive missing &gt;
                maxSalesGapDays.
              </p>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-0">
                  <label className="me-1 text-xs text-muted">Month (YYYY-MM)</label>
                  <input
                    type="text"
                    placeholder="YYYY-MM"
                    value={coverageMonth}
                    onChange={(e) => setCoverageMonth(e.target.value)}
                    className="w-full min-w-0 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground sm:w-28"
                  />
                </div>
                <button
                  type="button"
                  disabled={!coverageMonth.trim() || coverageLoading}
                  onClick={() => void loadCoverage()}
                  className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-subtle disabled:opacity-50 sm:w-auto"
                >
                  {coverageLoading ? '…' : 'Load Coverage'}
                </button>
              </div>
              {coverageResult && (
                <div className="mt-3 space-y-2">
                  {coverageResult.error ? (
                    <p className="text-sm text-red-600">{coverageResult.error}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        Completeness: {coverageResult.completenessPct ?? 0}% ({coverageResult.recordedCountTotal ?? 0} /{' '}
                        {coverageResult.expectedDaysCountTotal ?? 0} expected days)
                      </p>
                      <p className="text-xs text-muted">Max gap days (grace): {coverageResult.maxSalesGapDays ?? 7}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-0 table-auto border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border text-start text-muted">
                              <th className="py-1.5 pe-2">Employee</th>
                              <th className="py-1.5 pe-2 text-end">Expected</th>
                              <th className="py-1.5 pe-2 text-end">Recorded</th>
                              <th className="py-1.5 pe-2 text-end">Missing</th>
                              <th className="py-1.5 pe-2 text-end">Flagged gaps</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(coverageResult.byEmployee ?? []).map((e) => (
                              <tr key={e.employeeId} className="border-b border-border">
                                <td className="py-1.5 pe-2 font-medium">{e.name}</td>
                                <td className="py-1.5 pe-2 text-end">{e.expectedDaysCount ?? 0}</td>
                                <td className="py-1.5 pe-2 text-end">{e.recordedDaysCount ?? 0}</td>
                                <td className="py-1.5 pe-2 text-end">{e.missingDaysCount ?? 0}</td>
                                <td className="py-1.5 pe-2 text-end">{e.flaggedGapsCount ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <details className="text-xs text-muted">
                        <summary>Gap ranges and missing days (per employee)</summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border bg-surface-subtle p-2">
                          {JSON.stringify(
                            coverageResult.byEmployee?.map((e) => ({
                              name: e.name,
                              missingDays: e.missingDays,
                              flaggedGaps: e.flaggedGaps,
                            })),
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </OpsCard>
    </>
  );

  if (embedded) {
    return <div className="min-w-0 max-w-5xl">{mainInner}</div>;
  }

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-8 md:space-y-10">
      <SectionBlock
        title={t('sales.dailyLedger.pageTitle')}
        subtitle={t('sales.dailyLedger.pageSubtitle')}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sales/import"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
            >
              {t('sales.dailyLedger.linkMatrixImport')}
            </Link>
            <Link
              href="/nav/analytics/sales"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
            >
              {t('common.back')}
            </Link>
          </div>
        }
      >
        <div className="mx-auto max-w-5xl">{mainInner}</div>
      </SectionBlock>
    </PageContainer>
  );
}

function ManagerTotalInput({
  summary,
  saving,
  persistDisabled,
  onSave,
}: {
  summary: Summary;
  saving: boolean;
  persistDisabled?: boolean;
  onSave: (v: number) => void;
}) {
  const [val, setVal] = useState(String(summary.totalSar));
  useEffect(() => setVal(String(summary.totalSar)), [summary.totalSar]);
  const num = parseInt(val, 10);
  const valid = Number.isInteger(num) && num >= 0;
  return (
    <div className="flex gap-1">
      <input
        type="number"
        min={0}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={summary.status === 'LOCKED'}
        className="w-28 rounded border border-border bg-surface px-2 py-1 font-mono text-foreground"
      />
      {summary.status === 'DRAFT' && (
        <button
          type="button"
          disabled={saving || !valid || persistDisabled}
          onClick={() => valid && onSave(num)}
          className="rounded bg-surface-subtle px-2 py-1 text-sm text-foreground disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  );
}

function LedgerTable({
  boutiqueId,
  rows,
  employees,
  nameByEmpId,
  locked,
  batchSaving,
  persistBlocked,
  deletingClientRowId,
  firstSelectRef,
  employeePlaceholder,
  employeeEmpty,
  actionsColumnLabel,
  removeLineLabel,
  zeroAmountLabel,
  onUpdateRow,
  onRemoveRow,
  onZeroAmount,
  onEnterFromAmount,
}: {
  boutiqueId: string;
  rows: DraftLine[];
  employees: EmployeeOption[];
  nameByEmpId: Map<string, string>;
  locked: boolean;
  batchSaving: boolean;
  persistBlocked: boolean;
  deletingClientRowId: string | null;
  firstSelectRef?: MutableRefObject<HTMLSelectElement | null>;
  employeePlaceholder: string;
  employeeEmpty: string;
  actionsColumnLabel: string;
  removeLineLabel: string;
  zeroAmountLabel: string;
  onUpdateRow: (clientRowId: string, patch: Partial<DraftLine>) => void;
  onRemoveRow: (row: DraftLine) => void;
  onZeroAmount: (clientRowId: string) => void;
  onEnterFromAmount: (rowIndex: number) => void;
}) {
  return (
    <div className="w-full min-w-0 overflow-x-auto sm:overflow-x-visible [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[36rem] sm:min-w-0 table-auto border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-start text-muted">
            <th className="w-[34%] py-2 pe-2">Employee</th>
            <th className="w-[18%] py-2 pe-2">Amount (SAR)</th>
            <th className="w-[14%] py-2 pe-2">Status</th>
            <th className="w-[14%] py-2 pe-2">Save</th>
            <th className="w-[20%] py-2 pe-2">{actionsColumnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const fieldErr = validateDraftRow(row, rows, idx);
            const empInvalid = !!fieldErr.employee && (!isRowEmpty(row) || row.dirty);
            const amtInvalid = !!fieldErr.amount && (!isRowEmpty(row) || row.dirty);
            const displayName = row.employeeId.trim()
              ? nameByEmpId.get(row.employeeId.trim()) ?? row.employeeId.trim()
              : '';
            let statusLabel = '—';
            let statusClass = 'text-muted';
            if (!isRowEmpty(row)) {
              if (empInvalid || amtInvalid) {
                statusLabel = 'Error';
                statusClass = 'text-red-700';
              } else {
                statusLabel = 'Valid';
                statusClass = 'text-green-700';
              }
            }
            return (
              <tr key={row.clientRowId} className="border-b border-border align-top">
                <td className="py-2 pe-2">
                  {!locked ? (
                    <EmployeeSelect
                      value={row.employeeId}
                      displayNameFallback={displayName}
                      options={employees}
                      disabled={batchSaving}
                      selectRef={idx === 0 ? firstSelectRef : undefined}
                      dataAttr={`${boutiqueId}-${idx}`}
                      invalid={empInvalid}
                      placeholder={employeePlaceholder}
                      emptyLabel={employeeEmpty}
                      onChange={(empId) => onUpdateRow(row.clientRowId, { employeeId: empId })}
                    />
                  ) : (
                    <div>
                      <div className="font-medium text-foreground">{displayName || '—'}</div>
                      {row.employeeId.trim() ? (
                        <div className="text-xs text-muted">{row.employeeId.trim()}</div>
                      ) : null}
                    </div>
                  )}
                  {empInvalid && fieldErr.employee ? (
                    <p className="mt-1 text-xs text-red-600">{fieldErr.employee}</p>
                  ) : null}
                </td>
                <td className="py-2 pe-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    disabled={locked || batchSaving}
                    value={row.amountStr}
                    onChange={(e) => onUpdateRow(row.clientRowId, { amountStr: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onEnterFromAmount(idx);
                      }
                    }}
                    className={`w-full min-w-[5rem] rounded border bg-surface px-2 py-1 font-mono text-foreground ${
                      amtInvalid ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  {amtInvalid && fieldErr.amount ? (
                    <p className="mt-1 text-xs text-red-600">{fieldErr.amount}</p>
                  ) : null}
                </td>
                <td className={`py-2 pe-2 text-xs ${statusClass}`}>{statusLabel}</td>
                <td className="py-2 pe-2 text-xs text-muted">
                  {row.dirty && !isRowEmpty(row) ? (
                    <span className="text-amber-700">Pending</span>
                  ) : row.saveState === 'saving' ? (
                    <span>…</span>
                  ) : row.saveState === 'error' ? (
                    <span className="text-red-600">Error</span>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="py-2 pe-2">
                  {!locked && !batchSaving ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={
                          persistBlocked ||
                          deletingClientRowId === row.clientRowId ||
                          isRowEmpty(row)
                        }
                        onClick={() => onZeroAmount(row.clientRowId)}
                        className="rounded border border-border bg-surface px-2 py-0.5 text-xs text-foreground hover:bg-surface-subtle disabled:opacity-40"
                      >
                        {zeroAmountLabel}
                      </button>
                      <button
                        type="button"
                        disabled={
                          persistBlocked ||
                          deletingClientRowId === row.clientRowId ||
                          isRowEmpty(row)
                        }
                        onClick={() => onRemoveRow(row)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 disabled:opacity-40"
                      >
                        {deletingClientRowId === row.clientRowId ? '…' : removeLineLabel}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeSelect({
  value,
  displayNameFallback,
  options,
  disabled,
  selectRef,
  dataAttr,
  invalid,
  placeholder,
  emptyLabel,
  onChange,
}: {
  value: string;
  displayNameFallback: string;
  options: EmployeeOption[];
  disabled: boolean;
  selectRef?: MutableRefObject<HTMLSelectElement | null>;
  dataAttr: string;
  invalid: boolean;
  placeholder: string;
  emptyLabel: string;
  onChange: (empId: string) => void;
}) {
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [options]
  );
  const idSet = useMemo(() => new Set(sorted.map((o) => o.empId)), [sorted]);
  const v = value.trim();
  const unknownSelected = v !== '' && !idSet.has(v);
  const noChoices = sorted.length === 0 && !unknownSelected;
  const selectDisabled = disabled || noChoices;

  return (
    <div className="min-w-0">
      <select
        ref={(el) => {
          if (selectRef) selectRef.current = el;
        }}
        data-ledger-emp={dataAttr}
        disabled={selectDisabled}
        value={unknownSelected ? v : v === '' ? '' : idSet.has(v) ? v : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={`w-full min-w-0 rounded border bg-surface px-2 py-1.5 text-sm text-foreground ${
          invalid ? 'border-red-500' : 'border-border'
        } ${selectDisabled ? 'opacity-80' : ''}`}
      >
        <option value="">{noChoices ? emptyLabel : placeholder}</option>
        {sorted.map((o) => (
          <option key={o.empId} value={o.empId}>
            {o.name}
          </option>
        ))}
        {unknownSelected ? (
          <option value={v}>
            {displayNameFallback || v}
          </option>
        ) : null}
      </select>
      {v ? <div className="mt-0.5 text-xs text-muted tabular-nums">{v}</div> : null}
    </div>
  );
}
