'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { getCurrentMonthKeyRiyadh, addMonths } from '@/lib/time';

const DAYS_WINDOW = 7;
const REASON_MIN = 8;

type EmployeeRow = {
  employeeId: string;
  empId: string;
  name: string;
  active: boolean;
  source: string;
  userId: string | null;
};

type MatrixData = {
  scopeId: string;
  month: string;
  boutiqueLabel?: string;
  employees: EmployeeRow[];
  days: string[];
  matrix: Record<string, Record<string, number | null>>;
  totalsByEmployee: { employeeId: string; totalSar: number }[];
  totalsByDay: { date: string; totalSar: number }[];
  grandTotalSar: number;
  unlock: {
    sessionId: string;
    expiresAt: string;
    reason: string;
    createdAt: string;
  } | null;
  passcodeConfigured: boolean;
};

function addMonth(m: string, d: number): string {
  return addMonths(m, d);
}

function baselineNum(m: Record<string, Record<string, number | null>> | undefined, day: string, empId: string): number {
  const v = m?.[day]?.[empId];
  return typeof v === 'number' ? v : 0;
}

export function SecureMonthlyMatrixEditClient() {
  const { t } = useT();
  const [monthKey, setMonthKey] = useState(() => getCurrentMonthKeyRiyadh());
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayWindow, setDayWindow] = useState(0);
  const [search, setSearch] = useState('');
  const [onlyNonZero, setOnlyNonZero] = useState(false);

  const baselineRef = useRef<Record<string, Record<string, number | null>> | null>(null);
  const unlockSessionIdAfterFetchRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState<Map<string, number>>(() => new Map());
  const [unlockSession, setUnlockSession] = useState<MatrixData['unlock']>(null);
  const [expiresLeftSec, setExpiresLeftSec] = useState<number | null>(null);

  const [showUnlock, setShowUnlock] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const [saveReason, setSaveReason] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyJson, setHistoryJson] = useState<unknown>(null);

  const [editing, setEditing] = useState<{
    dateKey: string;
    empId: string;
    userId: string;
    draft: string;
  } | null>(null);

  const isEditMode = Boolean(unlockSession && new Date(unlockSession.expiresAt).getTime() > Date.now());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/sales/monthly-matrix-secure-edit?month=${encodeURIComponent(monthKey)}`,
        { cache: 'no-store' }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setData(null);
        setError(typeof j.error === 'string' ? j.error : 'Load failed');
        return;
      }
      setData(j as MatrixData);
      baselineRef.current = JSON.parse(JSON.stringify(j.matrix ?? {})) as Record<
        string,
        Record<string, number | null>
      >;
      const nextUnlockId = j.unlock?.sessionId ?? null;
      if (nextUnlockId !== unlockSessionIdAfterFetchRef.current) {
        setDirty(new Map());
      }
      unlockSessionIdAfterFetchRef.current = nextUnlockId;
      setUnlockSession(j.unlock ?? null);
    } catch {
      setData(null);
      setError('Load failed');
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!unlockSession) {
      setExpiresLeftSec(null);
      return;
    }
    const tick = () => {
      const ms = new Date(unlockSession.expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setExpiresLeftSec(0);
        setUnlockSession(null);
        unlockSessionIdAfterFetchRef.current = null;
        return;
      }
      setExpiresLeftSec(Math.floor(ms / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [unlockSession]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty.size]);

  const empToUser = useMemo(() => {
    const m = new Map<string, string>();
    if (!data?.employees) return m;
    for (const e of data.employees) {
      if (e.userId) m.set(e.empId, e.userId);
    }
    return m;
  }, [data?.employees]);

  const displayValue = useCallback(
    (dateKey: string, empId: string): number => {
      const dk = `${empId}\t${dateKey}`;
      if (dirty.has(dk)) return dirty.get(dk)!;
      return baselineNum(baselineRef.current ?? undefined, dateKey, empId);
    },
    [dirty]
  );

  const rowTotals = useMemo(() => {
    if (!data?.days || !data.employees) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const e of data.employees) {
      let s = 0;
      for (const d of data.days) {
        s += displayValue(d, e.empId);
      }
      m.set(e.empId, s);
    }
    return m;
  }, [data?.days, data?.employees, displayValue]);

  const colTotals = useMemo(() => {
    if (!data?.days || !data.employees) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const d of data.days) {
      let s = 0;
      for (const e of data.employees) {
        s += displayValue(d, e.empId);
      }
      m.set(d, s);
    }
    return m;
  }, [data?.days, data?.employees, displayValue]);

  const grandTotal = useMemo(() => {
    let s = 0;
    colTotals.forEach((v) => {
      s += v;
    });
    return s;
  }, [colTotals]);

  const filteredEmployees = useMemo(() => {
    if (!data?.employees) return [];
    let list = data.employees;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.empId.toLowerCase().includes(q) || (e.name && e.name.toLowerCase().includes(q))
      );
    }
    if (onlyNonZero) {
      list = list.filter((e) => (rowTotals.get(e.empId) ?? 0) > 0);
    }
    return list;
  }, [data?.employees, search, onlyNonZero, rowTotals]);

  const days = data?.days ?? [];
  const maxWindow = Math.max(0, Math.ceil(days.length / DAYS_WINDOW) - 1);
  const cw = Math.min(dayWindow, maxWindow);
  const windowDays = days.slice(cw * DAYS_WINDOW, cw * DAYS_WINDOW + DAYS_WINDOW);

  const warnNavigate = (): boolean => {
    if (dirty.size === 0) return true;
    return window.confirm(
      t('matrixSecureEdit.unsavedWarning') ??
        'You have unsaved changes. Leave without saving?'
    );
  };

  const onMonthChange = (next: string) => {
    if (!warnNavigate()) return;
    setMonthKey(next);
    setDirty(new Map());
    setUnlockSession(null);
    unlockSessionIdAfterFetchRef.current = null;
  };

  const submitUnlock = async () => {
    if (unlockReason.trim().length < REASON_MIN) {
      setError(
        t('matrixSecureEdit.reasonUnlock') ??
          `Reason must be at least ${REASON_MIN} characters.`
      );
      return;
    }
    setUnlockBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sales/monthly-matrix-secure-edit/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthKey,
          passcode,
          reason: unlockReason,
          confirmLive,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Unlock failed');
        return;
      }
      setShowUnlock(false);
      setPasscode('');
      const reasonSaved = unlockReason.trim();
      setUnlockReason('');
      setConfirmLive(false);
      setDirty(new Map());
      setUnlockSession({
        sessionId: j.sessionId,
        expiresAt: j.expiresAt,
        reason: reasonSaved,
        createdAt: new Date().toISOString(),
      });
      unlockSessionIdAfterFetchRef.current = j.sessionId;
      await fetchData();
    } finally {
      setUnlockBusy(false);
    }
  };

  const lockEditing = async () => {
    if (!unlockSession) return;
    await fetch('/api/admin/sales/monthly-matrix-secure-edit/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthKey, unlockSessionId: unlockSession.sessionId }),
    });
    setUnlockSession(null);
    setDirty(new Map());
    unlockSessionIdAfterFetchRef.current = null;
    await fetchData();
  };

  const discardLocal = async () => {
    if (!warnNavigate()) return;
    await fetch('/api/admin/sales/monthly-matrix-secure-edit/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: monthKey,
        unlockSessionId: unlockSession?.sessionId,
        discardedCount: dirty.size,
      }),
    });
    setDirty(new Map());
    setSaveMsg(null);
  };

  const saveChanges = async () => {
    if (!unlockSession || dirty.size === 0) return;
    if (saveReason.trim().length < REASON_MIN) {
      setError(
        t('matrixSecureEdit.reasonSave') ?? `Enter a save reason (min ${REASON_MIN} characters).`
      );
      return;
    }
    setSaveBusy(true);
    setError(null);
    setSaveMsg(null);
    try {
      const changedCells: Array<{ dateKey: string; userId: string; oldAmount: number; newAmount: number }> = [];
      for (const [key, newAmount] of Array.from(dirty.entries())) {
        const [empId, dateKey] = key.split('\t');
        const userId = empToUser.get(empId);
        if (!userId) continue;
        const oldAmount = baselineNum(baselineRef.current ?? undefined, dateKey, empId);
        if (oldAmount === newAmount) continue;
        changedCells.push({ dateKey, userId, oldAmount, newAmount });
      }
      if (changedCells.length === 0) {
        setSaveMsg('Nothing to save.');
        return;
      }
      const r = await fetch('/api/admin/sales/monthly-matrix-secure-edit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthKey,
          unlockSessionId: unlockSession.sessionId,
          reason: saveReason.trim(),
          changedCells,
          autoLock: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Save failed');
        if (Array.isArray(j.stale)) {
          setSaveMsg('Stale data — refresh required.');
        }
        return;
      }
      setSaveMsg(
        (t('matrixSecureEdit.saveOk') ?? 'Saved {n} cells.').replace('{n}', String(j.saved ?? 0))
      );
      setDirty(new Map());
      setSaveReason('');
      setUnlockSession(null);
      unlockSessionIdAfterFetchRef.current = null;
      await fetchData();
    } finally {
      setSaveBusy(false);
    }
  };

  const openHistory = async () => {
    const r = await fetch(
      `/api/admin/sales/monthly-matrix-secure-edit/history?month=${encodeURIComponent(monthKey)}`,
      { cache: 'no-store' }
    );
    setHistoryJson(await r.json().catch(() => ({})));
    setShowHistory(true);
  };

  const startEditCell = (dateKey: string, empId: string) => {
    if (!isEditMode) return;
    const uid = empToUser.get(empId);
    if (!uid) return;
    setEditing({ dateKey, empId, userId: uid, draft: String(displayValue(dateKey, empId)) });
  };

  const commitEdit = () => {
    if (!editing) return;
    const n = Math.round(Number(editing.draft));
    if (!Number.isFinite(n) || n < 0) {
      setEditing(null);
      return;
    }
    const base = baselineNum(baselineRef.current ?? undefined, editing.dateKey, editing.empId);
    const dk = `${editing.empId}\t${editing.dateKey}`;
    setDirty((prev) => {
      const next = new Map(prev);
      if (n === base) next.delete(dk);
      else next.set(dk, n);
      return next;
    });
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const cellClass = (dateKey: string, empId: string): string => {
    const dk = `${empId}\t${dateKey}`;
    if (dirty.has(dk)) return 'bg-amber-100 dark:bg-amber-950/40 ring-1 ring-amber-400';
    return '';
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">
        {t('matrixSecureEdit.title') ?? 'Secure matrix edit (production)'}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {t('matrixSecureEdit.subtitle') ?? 'Admin-only. Passcode required. All saves are audited.'}
      </p>

      {data && !data.passcodeConfigured && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {t('matrixSecureEdit.noPasscode') ??
            'MONTHLY_MATRIX_EDIT_PASSCODE_HASH is not set. Unlock is disabled.'}
        </div>
      )}

      {isEditMode && (
        <div className="mt-3 rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
          {t('matrixSecureEdit.bannerEdit') ?? 'Editing live production sales data.'}{' '}
          {expiresLeftSec != null && expiresLeftSec > 0 && (
            <span className="ms-2 tabular-nums">
              {t('matrixSecureEdit.expiresIn') ?? 'Session expires in'} {Math.floor(expiresLeftSec / 60)}:
              {String(expiresLeftSec % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      )}

      {!isEditMode && (
        <div className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-muted">
          {t('matrixSecureEdit.locked') ?? 'Read-only (locked). Unlock to edit.'}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t('common.search') ?? 'Search'}</span>
          <input
            type="search"
            className="h-9 w-48 rounded border border-border px-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyNonZero}
            onChange={(e) => setOnlyNonZero(e.target.checked)}
          />
          {t('matrixSecureEdit.onlyNonZero') ?? 'Only rows with sales'}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(addMonth(monthKey, -1))}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
        >
          ←
        </button>
        <span className="font-medium">{monthKey}</span>
        <button
          type="button"
          onClick={() => onMonthChange(addMonth(monthKey, 1))}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
        >
          →
        </button>
        {data?.boutiqueLabel != null && (
          <span className="text-sm text-muted">{data.boutiqueLabel}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!isEditMode ? (
          <button
            type="button"
            disabled={!data?.passcodeConfigured}
            onClick={() => setShowUnlock(true)}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('matrixSecureEdit.unlock') ?? 'Unlock editing'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void lockEditing()}
              className="rounded border border-border bg-surface px-4 py-2 text-sm"
            >
              {t('matrixSecureEdit.lock') ?? 'Lock editing'}
            </button>
            <input
              type="text"
              className="h-9 min-w-[200px] rounded border border-border px-2 text-sm"
              placeholder={t('matrixSecureEdit.saveReasonPh') ?? 'Save reason (min 8 chars)'}
              value={saveReason}
              onChange={(e) => setSaveReason(e.target.value)}
            />
            <button
              type="button"
              disabled={saveBusy || dirty.size === 0}
              onClick={() => void saveChanges()}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saveBusy ? '…' : t('matrixSecureEdit.save') ?? 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => void discardLocal()}
              className="rounded border border-border px-4 py-2 text-sm"
            >
              {t('matrixSecureEdit.discard') ?? 'Discard changes'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            if (!warnNavigate()) return;
            void fetchData();
          }}
          className="rounded border border-border px-4 py-2 text-sm"
        >
          {t('matrixSecureEdit.refresh') ?? 'Refresh'}
        </button>
        <button type="button" onClick={() => void openHistory()} className="rounded border border-border px-4 py-2 text-sm">
          {t('matrixSecureEdit.history') ?? 'Audit history'}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted">
        {t('matrixSecureEdit.dirtyCount') ?? 'Pending cells'}: {dirty.size}
        {unlockSession && (
          <>
            {' · '}
            {t('matrixSecureEdit.unlockReason') ?? 'Unlock reason'}: {unlockSession.reason}
          </>
        )}
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {saveMsg && <p className="mt-2 text-sm text-emerald-800">{saveMsg}</p>}

      {loading && <p className="mt-4 text-sm text-muted">Loading…</p>}

      {!loading && data && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: maxWindow + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDayWindow(i)}
                className={`rounded px-2 py-1 text-xs ${cw === i ? 'bg-accent text-white' : 'bg-surface-subtle'}`}
              >
                {i * DAYS_WINDOW + 1}–{Math.min((i + 1) * DAYS_WINDOW, days.length)}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-0 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  <th className="sticky left-0 z-10 min-w-[140px] border-r bg-surface-subtle px-3 py-2 text-start font-semibold">
                    Employee
                  </th>
                  {windowDays.map((d) => (
                    <th key={d} className="border-r px-2 py-2 text-center font-semibold">
                      {d.slice(8, 10)}
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 min-w-[80px] border-l bg-surface-subtle px-3 py-2 text-end font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.empId} className="border-b border-border">
                    <td className="sticky left-0 z-10 border-r bg-surface px-3 py-2 font-medium">
                      {emp.name || emp.empId}
                      {!emp.userId && (
                        <span className="ms-1 text-xs text-amber-700"> (no login)</span>
                      )}
                    </td>
                    {windowDays.map((d) => (
                      <td
                        key={d}
                        className={`border-r px-1 py-1 text-end tabular-nums ${cellClass(d, emp.empId)} ${
                          isEditMode && emp.userId ? 'cursor-pointer hover:bg-surface-subtle' : ''
                        }`}
                        onClick={() => startEditCell(d, emp.empId)}
                      >
                        {editing?.dateKey === d && editing.empId === emp.empId ? (
                          <input
                            className="w-full min-w-[3rem] rounded border border-accent px-1 text-end text-xs"
                            autoFocus
                            value={editing.draft}
                            onChange={(e) =>
                              setEditing((x) => (x ? { ...x, draft: e.target.value } : x))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            onBlur={() => commitEdit()}
                          />
                        ) : (
                          displayValue(d, emp.empId).toLocaleString('en-SA')
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-l bg-surface px-3 py-2 text-end font-medium tabular-nums">
                      {(rowTotals.get(emp.empId) ?? 0).toLocaleString('en-SA')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-subtle font-semibold">
                  <td className="sticky left-0 z-10 border-r bg-surface-subtle px-3 py-2">Day total</td>
                  {windowDays.map((d) => (
                    <td key={d} className="border-r px-2 py-2 text-end tabular-nums">
                      {(colTotals.get(d) ?? 0).toLocaleString('en-SA')}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 border-l bg-surface-subtle px-3 py-2 text-end tabular-nums">
                    {grandTotal.toLocaleString('en-SA')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {showUnlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl">
            <h2 className="text-lg font-semibold">{t('matrixSecureEdit.unlockTitle') ?? 'Unlock editing'}</h2>
            <p className="mt-2 text-sm text-muted">
              {t('matrixSecureEdit.unlockBlurb') ??
                'Enter the operations passcode and a reason. This is logged.'}
            </p>
            <label className="mt-3 block text-sm font-medium">Passcode</label>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            <label className="mt-3 block text-sm font-medium">Reason</label>
            <textarea
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              rows={3}
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmLive}
                onChange={(e) => setConfirmLive(e.target.checked)}
              />
              {t('matrixSecureEdit.confirmLive') ?? 'I confirm I am editing live production sales data.'}
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-4 py-2 text-sm"
                onClick={() => setShowUnlock(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  unlockBusy || !confirmLive || unlockReason.trim().length < REASON_MIN || !passcode
                }
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void submitUnlock()}
              >
                {unlockBusy ? '…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">Audit history</h2>
              <button type="button" className="text-sm underline" onClick={() => setShowHistory(false)}>
                Close
              </button>
            </div>
            <pre className="mt-3 max-h-[60vh] overflow-auto rounded bg-surface-subtle p-2 text-xs">
              {JSON.stringify(historyJson, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
