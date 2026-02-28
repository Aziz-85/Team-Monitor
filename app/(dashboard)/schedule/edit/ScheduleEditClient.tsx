'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useI18n } from '@/app/providers';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { getFirstName } from '@/lib/name';
import { computeCountsFromGridRows } from '@/lib/services/scheduleGrid';
import { ScheduleEditExcelViewClient } from '@/app/(dashboard)/schedule/edit/ScheduleEditExcelViewClient';
import { ScheduleEditMonthExcelViewClient } from '@/app/(dashboard)/schedule/edit/ScheduleEditMonthExcelViewClient';
import { ScheduleCellSelect } from '@/components/schedule/ScheduleCellSelect';
import { SCHEDULE_UI } from '@/lib/scheduleUi';
import {
  canLockUnlockDay,
  canLockWeek,
  canUnlockWeek,
  canApproveWeek,
} from '@/lib/permissions';
import { isDateInRamadanRange } from '@/lib/time/ramadan';
import { getCoverageHeaderLabel } from '@/lib/schedule/coverageHeaderLabel';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import type { Role } from '@prisma/client';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

function formatDDMM(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

function getDayName(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'long' });
}

function getDayShort(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'short' });
}

function weekStartSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function formatWeekRangeLabel(weekStart: string, locale: string): { start: string; end: string } {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  const startD = new Date(weekStart + 'T12:00:00Z');
  const endD = new Date(addDays(weekStart, 6) + 'T12:00:00Z');
  const loc = locale === 'ar' ? 'ar-SA' : 'en-GB';
  return {
    start: startD.toLocaleDateString(loc, opts),
    end: endD.toLocaleDateString(loc, opts),
  };
}

function formatMonthYear(monthStr: string, locale: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' });
}

function editKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

const FRIDAY_DAY_OF_WEEK = 5;
function isFriday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.getUTCDay() === FRIDAY_DAY_OF_WEEK;
}

function formatAuditBeforeAfter(
  before: string | null,
  after: string | null,
  t: (key: string) => string
): string {
  if (!before && !after) return '';
  try {
    const b = before ? JSON.parse(before) : null;
    const a = after ? JSON.parse(after) : null;
    const parts: string[] = [];
    if (b && typeof b === 'object') {
      if (b.overrideShift != null) parts.push(`${t('governance.auditBefore')}: ${b.overrideShift}`);
      if (b.empId) parts.push(`${t('governance.auditEmp')}: ${b.empId}`);
      if (b.date) parts.push(`${t('governance.auditDate')}: ${b.date}`);
      if (b.team) parts.push(`${t('governance.auditTeam')}: ${b.team}`);
      if (b.status) parts.push(`${t('governance.auditStatus')}: ${b.status}`);
    }
    if (a && typeof a === 'object') {
      if (a.overrideShift != null) parts.push(`${t('governance.auditAfter')}: ${a.overrideShift}`);
      if (a.team && a.effectiveFrom) parts.push(`${t('governance.auditTeam')} → ${a.team} from ${a.effectiveFrom}`);
      if (a.weekStart) parts.push(`${t('governance.auditWeek')}: ${a.weekStart}`);
      if (a.statusRevertedTo) parts.push(`${t('governance.auditReverted')}: ${a.statusRevertedTo}`);
      if (a.status) parts.push(`${t('governance.auditStatus')}: ${a.status}`);
    }
    return parts.length ? parts.join(' · ') : '';
  } catch {
    return '';
  }
}

function auditActionColor(action: string): string {
  if (action.includes('LOCK') || action.includes('APPROVED')) return 'border-l-4 border-rose-400 bg-rose-50/50';
  if (action.includes('UNLOCK') || action.includes('UNAPPROVED')) return 'border-l-4 border-emerald-400 bg-emerald-50/50';
  if (action.includes('OVERRIDE') || action.includes('COVERAGE')) return 'border-l-4 border-sky-400 bg-sky-50/50';
  if (action.includes('TEAM')) return 'border-l-4 border-amber-400 bg-amber-50/50';
  return 'border-l-4 border-slate-300 bg-slate-50/50';
}

const AUDIT_ACTION_KEYS: Record<string, string> = {
  SCHEDULE_BATCH_SAVE: 'governance.actionScheduleBatchSave',
  WEEK_SAVE: 'governance.actionWeekSave',
  OVERRIDE_CREATE: 'governance.actionOverrideAdded',
  OVERRIDE_UPDATE: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_CREATED: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_UPDATED: 'governance.actionOverrideUpdated',
  SHIFT_OVERRIDE_REMOVED: 'governance.actionOverrideRemoved',
  COVERAGE_SUGGESTION_APPLY: 'governance.actionCoverageApplied',
  COVERAGE_ADDED: 'governance.actionCoverageAdded',
  COVERAGE_REMOVED: 'governance.actionCoverageRemoved',
  DAY_LOCKED: 'governance.actionDayLocked',
  DAY_UNLOCKED: 'governance.actionDayUnlocked',
  WEEK_LOCKED: 'governance.actionWeekLocked',
  WEEK_UNLOCKED: 'governance.actionWeekUnlocked',
  WEEK_APPROVED: 'governance.actionWeekApproved',
  WEEK_UNAPPROVED: 'governance.actionWeekUnapproved',
  TEAM_CHANGE: 'governance.actionTeamChanged',
  TEAM_CHANGED: 'governance.actionTeamChanged',
};

const SUGGESTION_TYPE_KEYS: Record<string, string> = {
  MOVE: 'schedule.move',
  SWAP: 'schedule.swap',
  REMOVE_COVER: 'schedule.removeCover',
  ASSIGN: 'schedule.assign',
};

/** Fallback labels for shift options when i18n key is not resolved (display in dropdown) */
const SHIFT_LABEL_FALLBACKS: Record<string, string> = {
  amShort: 'AM',
  pmShort: 'PM',
  morning: 'Morning (AM)',
  evening: 'Evening (PM)',
  rashidAm: 'Rashid AM',
  rashidPm: 'Rashid PM',
  none: 'NONE',
};

function shiftLabel(t: (key: string) => string, key: keyof typeof SHIFT_LABEL_FALLBACKS): string {
  const fullKey = `schedule.shift.${key}`;
  const value = t(fullKey);
  return value && value !== fullKey ? value : SHIFT_LABEL_FALLBACKS[key] ?? key;
}

type EditableShift = 'MORNING' | 'EVENING' | 'NONE' | 'COVER_RASHID_AM' | 'COVER_RASHID_PM';

type GridCell = {
  date: string;
  availability: string;
  effectiveShift: string;
  overrideId: string | null;
  baseShift: string;
};

type GridRow = { empId: string; name: string; team: string; cells: GridCell[] };

type GridDay = { date: string; dayName: string; dayOfWeek: number; minAm: number; minPm: number };

type ScheduleSuggestion = {
  id: string;
  type: 'MOVE' | 'SWAP' | 'REMOVE_COVER' | 'ASSIGN';
  date: string;
  dayIndex: number;
  affected: Array<{ empId: string; name: string; fromShift: string; toShift: string }>;
  before: { am: number; pm: number; rashidAm: number; rashidPm: number };
  after: { am: number; pm: number; rashidAm: number; rashidPm: number };
  reason: string;
  highlightCells: string[];
};

type GridData = {
  weekStart: string;
  days: GridDay[];
  rows: GridRow[];
  counts: Array<{ amCount: number; pmCount: number; rashidAmCount?: number; rashidPmCount?: number }>;
  integrityWarnings?: string[];
  suggestions?: ScheduleSuggestion[];
};

type MonthData = {
  month: string;
  days: Array<{ date: string; amCount: number; pmCount: number; warnings: string[] }>;
};

type WeekGovernance = {
  weekStart: string;
  status: 'DRAFT' | 'APPROVED';
  approvedByName?: string | null;
  approvedByRole?: string | null;
  approvedAt?: string | null;
  weekLock: {
    lockedByUserId: string;
    lockedByName: string | null;
    lockedByRole?: string | null;
    lockedAt: string;
    reason?: string | null;
  } | null;
  lockedDays: Array<{
    date: string;
    lockedByUserId: string;
    lockedByName: string | null;
    lockedAt: string;
    reason?: string | null;
  }>;
};

type PendingEdit = {
  newShift: string;
  reason?: string;
  originalEffectiveShift: string;
  overrideId: string | null;
  employeeName: string;
};

type ValidationResult = { type: string; message: string; amCount: number; pmCount: number; minAm?: number };

const DEFAULT_REASON = 'Schedule adjustment';

function parseWeekStartFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return weekStartSaturday(new Date().toISOString().slice(0, 10));
  const normalized = weekStartSaturday(value);
  return normalized;
}

function parseMonthFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return new Date().toISOString().slice(0, 7);
  return value;
}

type MonthMode = 'summary' | 'excel';

export function ScheduleEditClient({
  initialRole,
  ramadanRange,
}: {
  initialRole: Role;
  ramadanRange?: { start: string; end: string } | null;
}) {
  const { messages, locale } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [tab, setTab] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => parseWeekStartFromUrl(searchParams.get('weekStart')));
  const [month, setMonth] = useState(() => parseMonthFromUrl(searchParams.get('month')));
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthExcelData, setMonthExcelData] = useState<{
    month: string;
    dayRows: import('@/app/(dashboard)/schedule/excel/ScheduleMonthExcelViewClient').MonthExcelDayRow[];
  } | null>(null);
  const [monthExcelLoading, setMonthExcelLoading] = useState(false);
  const [weekGovernance, setWeekGovernance] = useState<WeekGovernance | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [globalReason, setGlobalReason] = useState(DEFAULT_REASON);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState<{ href: string } | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [highlightedCells, setHighlightedCells] = useState<Set<string> | null>(null);
  const [suggestionConfirm, setSuggestionConfirm] = useState<ScheduleSuggestion | null>(null);
  const [lockDayModal, setLockDayModal] = useState<{ date: string; reason: string } | null>(null);
  const [lockActionLoading, setLockActionLoading] = useState(false);
  const [auditItems, setAuditItems] = useState<Array<{
    id: string;
    createdAt: string;
    action: string;
    reason: string | null;
    beforeJson: string | null;
    afterJson: string | null;
    entityId: string | null;
    actor: { name: string; role: string } | null;
  }>>([]);
  const [auditExpanded, setAuditExpanded] = useState<Set<string>>(new Set());
  const [editorView, setEditorViewState] = useState<'grid' | 'excel'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('schedule_editor_view');
      if (saved === 'grid' || saved === 'excel') return saved;
    }
    return 'grid';
  });
  const [monthMode, setMonthModeState] = useState<MonthMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('schedule_editor_month_view');
      if (saved === 'summary' || saved === 'excel') return saved as MonthMode;
    }
    return 'summary';
  });
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [sourceBoutiques, setSourceBoutiques] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedSourceBoutiqueId, setSelectedSourceBoutiqueId] = useState('');
  const [guestEmployees, setGuestEmployees] = useState<Array<{ empId: string; name: string; boutiqueName: string }>>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestForm, setGuestForm] = useState({ empId: '', date: '', shift: 'MORNING' as 'MORNING' | 'EVENING', reason: '' });
  type GuestItem = {
    id: string;
    date: string;
    empId: string;
    shift: string;
    reason?: string;
    sourceBoutiqueId?: string;
    sourceBoutique?: { id: string; name: string } | null;
    employee: { name: string; homeBoutiqueCode: string; homeBoutiqueName?: string };
    /** true = from another boutique (show in External Coverage); false = same branch */
    isExternal?: boolean;
  };
  const [weekGuests, setWeekGuests] = useState<GuestItem[]>([]);

  /** Only guests from other boutiques (same-branch excluded from External Coverage rows) */
  const externalGuests = useMemo(
    () => weekGuests.filter((g) => g.isExternal !== false),
    [weekGuests]
  );

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('schedule_editor_view') : null;
    if (saved === 'grid' || saved === 'excel') setEditorViewState(saved);
  }, []);

  useEffect(() => {
    if (!addGuestOpen) return;
    setGuestError(null);
    setGuestEmployees([]);
    setSelectedSourceBoutiqueId('');
    fetch('/api/schedule/external-coverage/source-boutiques')
      .then((r) => (r.ok ? r.json() : { boutiques: [] as Array<{ id: string; name: string; code: string }> }))
      .then((data: { boutiques?: Array<{ id: string; name: string; code: string }> }) => {
        const list = data?.boutiques ?? [];
        setSourceBoutiques(list);
        const defaultId =
          list.find((b) => /dhahran/i.test(b.name) || /dhahran/i.test(b.code))?.id ?? list[0]?.id ?? '';
        setSelectedSourceBoutiqueId(defaultId);
        const firstDay = gridData?.days?.[0]?.date ?? weekStart;
        setGuestForm((prev) => ({ ...prev, empId: '', date: firstDay, shift: 'MORNING', reason: '' }));
      })
      .catch(() => setSourceBoutiques([]));
  }, [addGuestOpen, weekStart, gridData?.days]);

  useEffect(() => {
    if (!addGuestOpen || !selectedSourceBoutiqueId) {
      setGuestEmployees([]);
      setGuestError(null);
      return;
    }
    setGuestLoading(true);
    setGuestError(null);
    fetch(`/api/schedule/external-coverage/employees?sourceBoutiqueId=${encodeURIComponent(selectedSourceBoutiqueId)}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((body: { error?: string }) => {
            setGuestError(body?.error ?? `Error ${r.status}`);
            return { employees: [] as Array<{ empId: string; name: string; boutiqueName?: string }> };
          });
        }
        return r.json().catch(() => ({}));
      })
      .then((data: { employees?: Array<{ empId: string; name: string; boutiqueName?: string }> }) => {
        const list = (data?.employees ?? []).map((e) => ({ empId: e.empId, name: e.name, boutiqueName: e.boutiqueName ?? '' }));
        setGuestEmployees(list);
        const sourceBoutique = sourceBoutiques.find((b) => b.id === selectedSourceBoutiqueId);
        const isDhahran = sourceBoutique ? /dhahran/i.test(sourceBoutique.name) || /dhahran/i.test(sourceBoutique.code) : false;
        if (list.length <= 2 && isDhahran && typeof console !== 'undefined' && console.warn) {
          console.warn('Low employee count — check local DB seed/import.');
        }
        setGuestForm((prev) => ({ ...prev, empId: '' }));
      })
      .catch(() => {
        setGuestError('Failed to load employees');
        setGuestEmployees([]);
      })
      .finally(() => setGuestLoading(false));
  }, [addGuestOpen, selectedSourceBoutiqueId, sourceBoutiques]);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [weekStart]);

  const guestsBySource = useMemo(() => {
    const bySource = new Map<string, { sourceBoutiqueName: string; guests: GuestItem[] }>();
    for (const g of externalGuests) {
      const sid = g.sourceBoutiqueId ?? '';
      const name = g.sourceBoutique?.name ?? g.employee.homeBoutiqueName ?? 'External';
      const existing = bySource.get(sid);
      if (existing) existing.guests.push(g);
      else bySource.set(sid, { sourceBoutiqueName: name, guests: [g] });
    }
    return Array.from(bySource.entries()).sort((a, b) => a[1].sourceBoutiqueName.localeCompare(b[1].sourceBoutiqueName));
  }, [externalGuests]);

  const coverageHeaderLabel = useMemo(
    () =>
      getCoverageHeaderLabel(externalGuests, {
        rashidLabel: t('schedule.rashidCoverage') ?? 'Rashid Coverage',
        externalLabel: t('schedule.externalCoverage') ?? 'External Coverage',
      }),
    [externalGuests, t]
  );

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('schedule_editor_month_view') : null;
    if (saved === 'summary' || saved === 'excel') setMonthModeState(saved as MonthMode);
  }, []);

  const setEditorView = useCallback((mode: 'grid' | 'excel') => {
    setEditorViewState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('schedule_editor_view', mode);
  }, []);

  const setMonthMode = useCallback((mode: MonthMode) => {
    setMonthModeState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('schedule_editor_month_view', mode);
  }, []);
  const [teamFilterExcel, setTeamFilterExcel] = useState<'all' | 'A' | 'B'>('all');
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const dayRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const isWeekLocked = !!(weekGovernance?.weekLock);

  const refetchScopeLabel = useCallback(() => {
    fetch('/api/me/operational-boutique')
      .then((r) => r.json().catch(() => null))
      .then((data: { label?: string } | null) => {
        setScopeLabel(data?.label ?? null);
      })
      .catch(() => setScopeLabel(null));
  }, []);

  const fetchGrid = useCallback(() => {
    const params = new URLSearchParams({ weekStart, scope: 'all', suggestions: '1' });
    return fetch(`/api/schedule/week/grid?${params}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then(setGridData)
      .catch(() => setGridData(null));
  }, [weekStart]);

  const fetchGuests = useCallback(() => {
    return fetch(`/api/schedule/guests?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data: {
        guests?: GuestItem[];
        pendingGuests?: Array<GuestItem & { pending?: boolean; requestId?: string }>;
      }) => {
        const applied = data.guests ?? [];
        const pending = data.pendingGuests ?? [];
        setWeekGuests([...applied, ...pending]);
      })
      .catch(() => setWeekGuests([]));
  }, [weekStart]);

  useEffect(() => {
    refetchScopeLabel();
  }, [refetchScopeLabel]);

  useEffect(() => {
    const onScopeChanged = () => {
      refetchScopeLabel();
      if (tab === 'week') {
        setGridLoading(true);
        fetch(`/api/schedule/week/grid?weekStart=${weekStart}&scope=all&suggestions=1`, { cache: 'no-store' })
          .then((r) => r.json().catch(() => null))
          .then(setGridData)
          .catch(() => setGridData(null))
          .finally(() => setGridLoading(false));
        fetchGuests();
        fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data ? setWeekGovernance(data) : setWeekGovernance(null)))
          .catch(() => setWeekGovernance(null));
      }
    };
    window.addEventListener('scope-changed', onScopeChanged);
    return () => window.removeEventListener('scope-changed', onScopeChanged);
  }, [tab, weekStart, refetchScopeLabel, fetchGuests]);

  const canEdit = !isWeekLocked;
  const lockedDaySet = useMemo(
    () => new Set(weekGovernance?.lockedDays?.map((d) => d.date) ?? []),
    [weekGovernance?.lockedDays]
  );
  const lockedDayInfo = useMemo(
    () => Object.fromEntries((weekGovernance?.lockedDays ?? []).map((d) => [d.date, d])),
    [weekGovernance?.lockedDays]
  );

  const fetchWeekGovernance = useCallback(() => {
    fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data ? setWeekGovernance(data) : setWeekGovernance(null)))
      .catch(() => setWeekGovernance(null));
  }, [weekStart]);

  const [removingGuestId, setRemovingGuestId] = useState<string | null>(null);
  const handleRemoveGuestShift = useCallback(
    (id: string) => {
      setRemovingGuestId(id);
      fetch(`/api/schedule/guests?id=${encodeURIComponent(id)}`, { method: 'DELETE', cache: 'no-store' })
        .then((r) => {
          if (r.ok) {
            fetchGuests();
            fetchGrid();
            fetchWeekGovernance();
            setToast(t('schedule.guestRemoved') ?? 'Guest removed from coverage');
            setTimeout(() => setToast(null), 3000);
          } else {
            return r.json().then((body: { error?: string }) => {
              setToast(body?.error ?? 'Failed to remove');
              setTimeout(() => setToast(null), 4000);
            });
          }
        })
        .catch(() => {
          setToast('Failed to remove guest');
          setTimeout(() => setToast(null), 4000);
        })
        .finally(() => setRemovingGuestId(null));
    },
    [fetchGuests, fetchGrid, fetchWeekGovernance, t]
  );

  useEffect(() => {
    if (tab === 'week') {
      setGridLoading(true);
      fetchGrid().finally(() => setGridLoading(false));
      fetchGuests();
    }
  }, [tab, fetchGrid, fetchGuests]);

  useEffect(() => {
    if (tab === 'week') fetchWeekGovernance();
  }, [tab, weekStart, fetchWeekGovernance]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && tab === 'week') fetchWeekGovernance();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [tab, fetchWeekGovernance]);

  // Keyboard: ← previous, → next (week or month)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (tab === 'week') setWeekStart((ws) => addDays(ws, -7));
        else setMonth((m) => addMonths(m, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (tab === 'week') setWeekStart((ws) => addDays(ws, 7));
        else setMonth((m) => addMonths(m, 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'week' || !weekStart) {
      setAuditItems([]);
      return;
    }
    fetch(`/api/audit?limit=20&weekStart=${weekStart}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) =>
        setAuditItems(
          (data.items ?? []).map(
            (i: {
              id: string;
              createdAt: string;
              action: string;
              reason: string | null;
              beforeJson: string | null;
              afterJson: string | null;
              entityId: string | null;
              actor: { name: string; role: string } | null;
            }) => ({
              id: i.id,
              createdAt: i.createdAt,
              action: i.action,
              reason: i.reason ?? null,
              beforeJson: i.beforeJson ?? null,
              afterJson: i.afterJson ?? null,
              entityId: i.entityId ?? null,
              actor: i.actor,
            })
          )
        )
      )
      .catch(() => setAuditItems([]));
  }, [tab, weekStart]);

  useEffect(() => {
    setPendingEdits(new Map());
    setDismissedSuggestionIds(new Set());
  }, [weekStart]);

  // Keep URL in sync with week/month and editor view
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab === 'week') {
      params.set('weekStart', weekStart);
      if (editorView === 'excel') params.set('view', 'excel');
    } else {
      params.set('month', month);
    }
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (typeof window !== 'undefined' && (window.location.pathname + (window.location.search || '')) !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [pathname, tab, weekStart, month, editorView]);

  useEffect(() => {
    if (tab === 'month') {
      setMonthLoading(true);
      fetch(`/api/schedule/month?month=${month}`, { cache: 'no-store' })
        .then((r) => r.json().catch(() => null))
        .then(setMonthData)
        .catch(() => setMonthData(null))
        .finally(() => setMonthLoading(false));
    }
  }, [tab, month]);

  useEffect(() => {
    if (tab !== 'month' || monthMode !== 'excel') return;
    setMonthExcelLoading(true);
    const params = new URLSearchParams({ month, locale: locale === 'ar' ? 'ar' : 'en' });
    fetch(`/api/schedule/month/excel?${params}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setMonthExcelData(data);
        } else {
          setMonthExcelData(null);
        }
      })
      .catch(() => setMonthExcelData(null))
      .finally(() => setMonthExcelLoading(false));
  }, [tab, monthMode, month, locale]);

  const pendingCount = pendingEdits.size;

  const getDraftShift = useCallback(
    (empId: string, date: string, serverEffective: string): string => {
      const edit = pendingEdits.get(editKey(empId, date));
      return edit ? edit.newShift : serverEffective;
    },
    [pendingEdits]
  );

  const draftCounts = useMemo(() => {
    if (!gridData?.rows.length) return [];
    return computeCountsFromGridRows(gridData.rows, getDraftShift);
  }, [gridData, getDraftShift]);

  const getRowAndCell = useCallback(
    (empId: string, date: string): { row: GridRow; cell: GridCell } | null => {
      if (!gridData) return null;
      const row = gridData.rows.find((r) => r.empId === empId);
      if (!row) return null;
      const cell = row.cells.find((c) => c.date === date);
      return cell ? { row, cell } : null;
    },
    [gridData]
  );

  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'excel') setEditorViewState('excel');
    else if (v === 'grid') setEditorViewState('grid');
  }, [searchParams]);

  const validationsByDay = useMemo(
    (): Array<{ date: string; validations: ValidationResult[] }> =>
      gridData?.days.map((day, i) => {
        const count = draftCounts[i] ?? gridData.counts[i];
        const am = count?.amCount ?? 0;
        const pm = count?.pmCount ?? 0;
        const effectiveMinAm = day.dayOfWeek === 5 ? 0 : Math.max(day.minAm ?? 2, 2);
        const minPm = day.minPm ?? 0;
        const isFriday = day.dayOfWeek === 5;
        const validations: ValidationResult[] = [];
        if (am > pm) validations.push({ type: 'RASHID_OVERFLOW', message: (t('schedule.warningRashidOverflow') as string) || `AM (${am}) > PM (${pm})`, amCount: am, pmCount: pm });
        if (!isFriday && effectiveMinAm > 0 && am < effectiveMinAm) validations.push({ type: 'MIN_AM', message: (t('schedule.minAmTwo') as string) || `AM (${am}) < ${effectiveMinAm}`, amCount: am, pmCount: pm, minAm: effectiveMinAm });
        if (minPm > 0 && pm < minPm) validations.push({ type: 'MIN_PM', message: (t('schedule.warningMinPm') as string) || `PM (${pm}) < Min PM (${minPm})`, amCount: am, pmCount: pm });
        return { date: day.date, validations };
      }) ?? [],
    [gridData, draftCounts, t]
  );
  const daysNeedingAttention = validationsByDay.filter((d) => d.validations.length > 0).length;

  const addPendingEdit = useCallback(
    (empId: string, date: string, newShift: string, row: GridRow, cell: GridCell) => {
      const key = editKey(empId, date);
      if (newShift === cell.effectiveShift) {
        setPendingEdits((m) => {
          const next = new Map(m);
          next.delete(key);
          return next;
        });
        return;
      }
      setPendingEdits((m) => {
        const next = new Map(m);
        next.set(key, {
          newShift,
          originalEffectiveShift: cell.effectiveShift,
          overrideId: cell.overrideId,
          employeeName: row.name,
        });
        return next;
      });
    },
    []
  );

  const clearPendingEdit = useCallback((empId: string, date: string) => {
    setPendingEdits((m) => {
      const next = new Map(m);
      next.delete(editKey(empId, date));
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    setPendingEdits(new Map());
    setLeaveConfirm(null);
  }, []);

  const focusDay = useCallback((date: string) => {
    const el = dayRefs.current[date];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      el.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
    }
  }, []);

  const suggestionPreview = useCallback(
    (s: ScheduleSuggestion) => {
      focusDay(s.date);
      setHighlightedCells(new Set(s.highlightCells));
      setTimeout(() => setHighlightedCells(null), 3000);
    },
    [focusDay]
  );

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedSuggestionIds((prev) => new Set(Array.from(prev).concat(id)));
  }, []);

  const applySuggestion = useCallback(
    async (s: ScheduleSuggestion) => {
      if (!gridData || s.affected.length === 0) return;
      const a = s.affected[0];
      const row = gridData.rows.find((r) => r.empId === a.empId);
      const cell = row?.cells.find((c) => c.date === s.date);
      if (!cell) return;
      setSaving(true);
      try {
        const res = await fetch('/api/schedule/week/grid/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: `Suggestion: ${s.reason.slice(0, 80)}`,
            changes: [
              {
                empId: a.empId,
                date: s.date,
                newShift: a.toShift,
                originalEffectiveShift: cell.effectiveShift,
                overrideId: cell.overrideId,
              },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setToast((data.error as string) || t('governance.scheduleLocked'));
          fetchWeekGovernance?.();
          fetchGrid();
          setTimeout(() => setToast(null), 5000);
          return;
        }
        if (res.status === 400 && (data.code === 'RAMADAN_PM_BLOCKED' || data.code === 'FRIDAY_PM_ONLY')) {
          setToast(locale === 'ar' ? (data.messageAr as string) : (data.code === 'FRIDAY_PM_ONLY' ? (t('schedule.fridayPmOnly') as string) : (t('schedule.ramadanPmBlocked') as string)));
          setTimeout(() => setToast(null), 5000);
          return;
        }
        const applied = data.applied ?? 0;
        setSuggestionConfirm(null);
        setDismissedSuggestionIds((prev) => new Set(Array.from(prev).concat(s.id)));
        fetchGrid();
        setToast(applied ? (t('schedule.savedChanges') as string)?.replace?.('{n}', '1') ?? 'Saved 1 change' : 'No change applied');
        setTimeout(() => setToast(null), 3000);
      } finally {
        setSaving(false);
      }
    },
    [gridData, fetchGrid, fetchWeekGovernance, t, locale]
  );

  const applyBatch = useCallback(async () => {
    const entries = Array.from(pendingEdits.entries());
    if (entries.length === 0) return;
    setSaving(true);
    setSaveProgress({ done: 0, total: entries.length });
    const reason = globalReason.trim() || DEFAULT_REASON;
    const changes = entries.map(([key, edit]) => {
      const [empId, date] = key.split('|');
      return {
        empId,
        date,
        newShift: edit.newShift,
        originalEffectiveShift: edit.originalEffectiveShift,
        overrideId: edit.overrideId,
      };
    });
    try {
      const res = await fetch('/api/schedule/week/grid/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setToast((data.error as string) || t('governance.scheduleLocked'));
        fetchWeekGovernance();
        fetchGrid();
        setTimeout(() => setToast(null), 5000);
        return;
      }
      if (res.status === 400 && (data.code === 'RAMADAN_PM_BLOCKED' || data.code === 'FRIDAY_PM_ONLY')) {
        setToast(locale === 'ar' ? (data.messageAr as string) : (data.code === 'FRIDAY_PM_ONLY' ? (t('schedule.fridayPmOnly') as string) : (t('schedule.ramadanPmBlocked') as string)));
        setTimeout(() => setToast(null), 5000);
        return;
      }
      const applied = data.applied ?? 0;
      const skipped = data.skipped ?? 0;
      setPendingEdits(new Map());
      setSaveModalOpen(false);
      setGlobalReason(DEFAULT_REASON);
      fetchGrid();
      fetchWeekGovernance();
      let msg = (t('schedule.savedChanges') as string)?.replace?.('{n}', String(applied)) ?? `Saved ${applied} changes`;
      if (skipped > 0) msg += `. ${skipped} skipped (${t('schedule.fridayPmOnly')})`;
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [pendingEdits, globalReason, fetchGrid, fetchWeekGovernance, t, locale]);

  useEffect(() => {
    if (pendingCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingCount]);

  useEffect(() => {
    if (pendingCount === 0 || !canEdit) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="/"]');
      if (!anchor) return;
      const href = (anchor as HTMLAnchorElement).getAttribute('href');
      if (!href || href === pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveConfirm({ href });
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pendingCount, canEdit, pathname]);

  

  return (
    <div className="min-w-0 overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-5xl overflow-x-hidden px-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('week')}
              className={`h-9 md:h-10 rounded-lg px-4 font-medium ${tab === 'week' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50'}`}
            >
              {t('schedule.week')}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setTab('month')}
                className={`h-9 md:h-10 rounded-lg px-4 font-medium ${tab === 'month' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50'}`}
              >
                {t('schedule.month')}
              </button>
            )}
          </div>
          {tab === 'week' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  disabled={gridLoading}
                  title={t('schedule.previousWeek')}
                  className="h-9 md:h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.previousWeek')}
                >
                  <span aria-hidden>◀</span>
                </button>
                <span className="min-w-[200px] text-base font-medium text-slate-800">
                  {(t('schedule.weekOf') ?? 'Week of {start} – {end}')
                    .replace('{start}', formatWeekRangeLabel(weekStart, locale).start)
                    .replace('{end}', formatWeekRangeLabel(weekStart, locale).end)}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  disabled={gridLoading}
                  title={t('schedule.nextWeek')}
                  className="h-9 md:h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.nextWeek')}
                >
                  <span aria-hidden>▶</span>
                </button>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(weekStartSaturday(e.target.value))}
                  className="rounded border border-slate-300 px-3 py-2 text-base"
                  aria-label={t('schedule.week')}
                />
                {scopeLabel && (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    {(t('schedule.scopeLabel') ?? 'Scope')}: {scopeLabel}
                  </span>
                )}
              </div>
              {ramadanRange && (() => {
                const ramadanMode = gridData?.days.some((d) => isDateInRamadanRange(new Date(d.date + 'T12:00:00Z'), ramadanRange!)) ?? false;
                return (
                  <>
                    {ramadanMode && (
                      <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800">
                        {t('schedule.ramadanModeBanner')}
                      </span>
                    )}
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-600" title="Ramadan env range">
                      {(t('schedule.ramadanDebug') ?? 'RamadanMode: {status} ({range}) · weekStart: {weekStart}')
                        .replace('{status}', ramadanMode ? 'ON' : 'OFF')
                        .replace('{range}', `${ramadanRange.start}–${ramadanRange.end}`)
                        .replace('{weekStart}', weekStart)}
                    </span>
                  </>
                );
              })()}
              {weekGovernance && (
                <span
                  className={`rounded px-2 py-1 text-sm font-medium ${weekGovernance.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                  title={
                    weekGovernance.status === 'DRAFT'
                      ? (t('governance.tooltipDraft') ?? 'Draft — week not yet approved')
                      : weekGovernance.approvedByName && weekGovernance.approvedAt
                        ? `${t('governance.approvedBy') ?? 'Approved by'} ${weekGovernance.approvedByName}${weekGovernance.approvedByRole ? ` (${weekGovernance.approvedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.approvedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                        : (t('governance.tooltipApproved') ?? 'Approved — week can be locked')
                  }
                >
                  {weekGovernance.status === 'DRAFT' ? t('governance.draft') : t('governance.approved')}
                </span>
              )}
              {weekGovernance?.weekLock && (
                <span
                  className="rounded bg-rose-100 px-2 py-1 text-sm font-medium text-rose-800"
                  title={
                    weekGovernance.weekLock.lockedByName && weekGovernance.weekLock.lockedAt
                      ? `${t('governance.lockedBy')} ${weekGovernance.weekLock.lockedByName}${weekGovernance.weekLock.lockedByRole ? ` (${weekGovernance.weekLock.lockedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.weekLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                      : (t('governance.tooltipLocked') ?? 'Locked — schedule cannot be edited')
                  }
                >
                  🔒 {t('governance.locked') ?? 'Locked'}
                </span>
              )}
              {canEdit && !isWeekLocked && (
                <button
                  type="button"
                  onClick={() => setAddGuestOpen(true)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('schedule.addExternalCoverage') ?? 'Add External Coverage'}
                </button>
              )}
              {canLockUnlockDay(initialRole) && (
                <button
                  type="button"
                  onClick={() => setLockDayModal({ date: gridData?.days?.[0]?.date ?? weekStart, reason: '' })}
                  disabled={lockActionLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('governance.lockDay')}
                </button>
              )}
              {canLockWeek(initialRole) && !weekGovernance?.weekLock && weekGovernance?.status === 'APPROVED' && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/lock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: 'WEEK', weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        fetchGrid();
                        setToast(t('governance.weekLocked'));
                      } else setToast((data.error as string) || t('governance.approveBeforeLock') || 'Week must be approved before it can be locked');
                      setTimeout(() => setToast(null), 4000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  {t('governance.lockWeek')}
                </button>
              )}
              {canUnlockWeek(initialRole) && weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/unlock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: 'WEEK', weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        fetchGrid();
                        setToast(t('governance.weekUnlocked'));
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {t('governance.unlockWeek')}
                </button>
              )}
              {canApproveWeek(initialRole) && weekGovernance?.status === 'DRAFT' && !weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/approve-week', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        setToast(t('governance.weekApproved'));
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-emerald-300 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {t('governance.approveWeek')}
                </button>
              )}
              {initialRole === 'ADMIN' && weekGovernance?.status === 'APPROVED' && !weekGovernance?.weekLock && (
                <button
                  type="button"
                  onClick={async () => {
                    setLockActionLoading(true);
                    try {
                      const res = await fetch('/api/schedule/week/unapprove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weekStart }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        fetchWeekGovernance();
                        setToast(t('governance.weekUnapproved') ?? 'Week unapproved');
                      } else setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setLockActionLoading(false);
                    }
                  }}
                  disabled={lockActionLoading}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {t('governance.unapproveWeek') ?? 'Unapprove week'}
                </button>
              )}
            </>
          )}
        {tab === 'month' && (
          <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, -1))}
                disabled={monthLoading}
                title={t('schedule.previousMonth')}
                className="rounded border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                aria-label={t('schedule.previousMonth')}
              >
                <span aria-hidden>◀</span>
              </button>
              <span className="min-w-[140px] text-base font-medium text-slate-800">
                {formatMonthYear(month, locale)}
              </span>
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, 1))}
                disabled={monthLoading}
                title={t('schedule.nextMonth')}
                className="rounded border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                aria-label={t('schedule.nextMonth')}
              >
                <span aria-hidden>▶</span>
              </button>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-base"
                aria-label={t('schedule.month')}
              />
              <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setMonthMode('summary')}
                  className={`rounded-md px-3 text-sm font-medium transition-colors ${
                    monthMode === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('editor.monthSummary') ?? 'Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => setMonthMode('excel')}
                  className={`rounded-md px-3 text-sm font-medium transition-colors ${
                    monthMode === 'excel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('editor.monthExcelView') ?? 'Excel View'}
                </button>
              </div>
            </div>
          )}
          {canEdit && tab === 'week' && (
            <>
              {pendingCount > 0 && (
                <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800">
                  {(t('schedule.unsavedCount') as string)?.replace?.('{n}', String(pendingCount)) ?? `${pendingCount} changes`}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                disabled={pendingCount === 0}
                className="h-9 md:h-10 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('schedule.saveChanges') ?? 'Save changes'}
              </button>
              <button
                type="button"
                onClick={discardAll}
                disabled={pendingCount === 0}
                className="h-9 md:h-10 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('schedule.discardChanges') ?? 'Discard changes'}
              </button>
            </>
          )}
        </div>

        {tab === 'week' && isWeekLocked && (
          <div className="mb-4 flex items-center gap-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
            <span className="font-semibold">{t('governance.scheduleLocked')}</span>
            {weekGovernance?.weekLock && (
              <span className="text-rose-700">
                🔒 {t('governance.lockedBy')} {weekGovernance.weekLock.lockedByName ?? weekGovernance.weekLock.lockedByUserId} {t('common.on')}{' '}
                <span dir="ltr">{new Date(weekGovernance.weekLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                  dateStyle: 'short',
                })}</span>
              </span>
            )}
          </div>
        )}

        {tab === 'week' && gridData?.integrityWarnings && gridData.integrityWarnings.length > 0 && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <span className="font-medium">{t('schedule.fridayPmOnly')}</span>
            <span className="ml-1">— {gridData.integrityWarnings.join('; ')}</span>
          </div>
        )}

        {tab === 'week' && gridData && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorView === 'grid'}
                  onClick={() => setEditorView('grid')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${editorView === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('editor.gridView') ?? 'Grid View'}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorView === 'excel'}
                  onClick={() => setEditorView('excel')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${editorView === 'excel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('editor.excelView') ?? 'Excel View'}
                </button>
              </div>
              {editorView === 'excel' && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                  <span className="text-xs text-slate-600">{t('editor.teamFilter') ?? 'Team:'}</span>
                  <select
                    value={teamFilterExcel}
                    onChange={(e) => setTeamFilterExcel(e.target.value as 'all' | 'A' | 'B')}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  >
                    <option value="all">{t('editor.allEmployees') ?? 'All employees'}</option>
                    <option value="A">{t('schedule.teamA') ?? 'Team A'}</option>
                    <option value="B">{t('schedule.teamB') ?? 'Team B'}</option>
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'week' && gridData && (
        <div className="flex min-w-0 flex-col gap-4">
            {editorView === 'grid' ? (
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-medium text-slate-500">{t('schedule.coverage') ?? 'Shifts'}:</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 font-medium text-sky-800">{t('schedule.morning')}</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-900">{t('schedule.evening')}</span>
                  <span className="ml-2 font-medium text-slate-500">{t('governance.weekStatus') ?? 'Status'}:</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{t('governance.draft')}</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">{t('governance.approved')}</span>
                  <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 font-medium text-red-900">🔒 {t('governance.locked')}</span>
                </div>
                <div className="max-w-full overflow-hidden">
                  <LuxuryTable noScroll>
                    <LuxuryTableHead>
                      <LuxuryTh className="sticky left-0 z-10 w-[18%] min-w-0 bg-slate-100">
                        {t('schedule.day')}
                      </LuxuryTh>
                      {gridData.days.map((day) => {
                        const dayLock = lockedDayInfo[day.date];
                        return (
                          <LuxuryTh
                            key={day.date}
                            ref={(el) => {
                              dayRefs.current[day.date] = el;
                            }}
                            className="w-[11.7%] min-w-0 text-center"
                          >
                            <div className="font-medium">{getDayName(day.date, locale)}</div>
                            <div className="text-xs text-slate-500">{formatDDMM(day.date)}</div>
                            {dayLock && (
                              <div className="mt-1 flex flex-col items-center gap-0.5 text-xs text-rose-600">
                                <span
                                  title={`${t('governance.lockedBy')} ${dayLock.lockedByName ?? dayLock.lockedByUserId} ${t('common.on')} ${new Date(dayLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`}
                                >
                                  🔒 {dayLock.lockedByName ?? dayLock.lockedByUserId}
                                </span>
                                {canLockUnlockDay(initialRole) && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setLockActionLoading(true);
                                      try {
                                        const res = await fetch('/api/schedule/unlock', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ scope: 'DAY', date: day.date }),
                                        });
                                        if (res.ok) {
                                          fetchWeekGovernance();
                                          fetchGrid();
                                          setToast(t('governance.dayUnlocked'));
                                        }
                                        setTimeout(() => setToast(null), 3000);
                                      } finally {
                                        setLockActionLoading(false);
                                      }
                                    }}
                                    disabled={lockActionLoading}
                                    className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800 hover:bg-rose-200 disabled:opacity-50"
                                  >
                                    {t('governance.unlockDay')}
                                  </button>
                                )}
                              </div>
                            )}
                          </LuxuryTh>
                        );
                      })}
                    </LuxuryTableHead>
                    <LuxuryTableBody>
                      {gridData.rows
                        .slice()
                        .sort((a, b) => {
                          if (a.team !== b.team) return a.team.localeCompare(b.team);
                          return a.name.localeCompare(b.name);
                        })
                        .map((row) => (
                          <tr key={row.empId}>
                            <LuxuryTd className="sticky left-0 z-10 w-[18%] min-w-0 bg-white font-medium" title={`${row.name} (${row.empId})`}>
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full text-[10px] font-semibold ${row.team === 'A' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}
                                  aria-label={row.team === 'A' ? t('schedule.teamA') : t('schedule.teamB')}
                                >
                                  {row.team}
                                </span>
                                                <span className="whitespace-nowrap">
                                  {getFirstName(row.name)}
                                </span>
                              </span>
                            </LuxuryTd>
                            {row.cells.map((cell) => {
                              const locked = cell.availability !== 'WORK';
                              const key = editKey(row.empId, cell.date);
                              const edit = pendingEdits.get(key);
                              const draftShift = edit ? edit.newShift : cell.effectiveShift;
                              const isEdited = !!edit;
                              const hasOverride = !!cell.overrideId;
                              const isBase = !locked && !hasOverride;
                              const cellClass = [
                                'w-[11.7%] min-w-0 p-0 align-middle',
                                isEdited && 'ring-1 ring-sky-400 ring-inset',
                                highlightedCells?.has(key) && 'ring-2 ring-green-500 bg-green-50',
                                isBase && 'bg-slate-50/60',
                                hasOverride && !isEdited && 'border-l-2 border-sky-400 bg-sky-50/50',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <LuxuryTd key={cell.date} className={cellClass}>
                                  {locked ? (
                                    <div className={`flex h-9 items-center justify-center bg-slate-100 px-2 text-center ${SCHEDULE_UI.guestLine} text-slate-500`}>
                                      {cell.availability === 'LEAVE'
                                        ? t('leaves.title')
                                        : cell.availability === 'OFF'
                                        ? t('common.offDay')
                                        : t('inventory.absent')}
                                    </div>
                                  ) : canEdit && !lockedDaySet.has(cell.date) ? (
                                    <div
                                      className="relative flex h-9 items-center justify-center px-1"
                                      title={isFriday(cell.date) ? t('schedule.fridayPmOnly') : undefined}
                                    >
                                      <div className="flex flex-col items-center gap-0.5">
                                        {(() => {
                                          const ramadanDay = ramadanRange ? isDateInRamadanRange(new Date(cell.date + 'T12:00:00Z'), ramadanRange) : false;
                                          const friday = isFriday(cell.date);
                                          const options: { value: string; label: string }[] =
                                            friday && !ramadanDay
                                              ? [
                                                  { value: 'EVENING', label: shiftLabel(t, 'pmShort') },
                                                  { value: 'COVER_RASHID_PM', label: shiftLabel(t, 'rashidPm') },
                                                  { value: 'NONE', label: shiftLabel(t, 'none') },
                                                ]
                                              : [
                                                  { value: 'MORNING', label: shiftLabel(t, 'amShort') },
                                                  { value: 'EVENING', label: shiftLabel(t, 'pmShort') },
                                                  { value: 'COVER_RASHID_AM', label: shiftLabel(t, 'rashidAm') },
                                                  { value: 'COVER_RASHID_PM', label: shiftLabel(t, 'rashidPm') },
                                                  { value: 'NONE', label: shiftLabel(t, 'none') },
                                                ];
                                          if (isEdited || hasOverride) {
                                            options.push({ value: 'RESET', label: t('schedule.resetToBase') ?? 'Reset to Base' });
                                          }
                                          return (
                                            <ScheduleCellSelect
                                              compact
                                              value={draftShift}
                                              options={options}
                                              onChange={(val) => {
                                                if (val === 'RESET') {
                                                  clearPendingEdit(row.empId, cell.date);
                                                  return;
                                                }
                                                addPendingEdit(row.empId, cell.date, val as EditableShift, row, cell);
                                              }}
                                              className="max-w-[84px] text-center"
                                            />
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      className="flex h-9 flex-col items-center justify-center gap-0.5 px-2 text-sm"
                                      title={
                                        lockedDaySet.has(cell.date) && lockedDayInfo[cell.date]
                                          ? `${t('governance.lockedBy')} ${
                                              lockedDayInfo[cell.date].lockedByName ??
                                              lockedDayInfo[cell.date].lockedByUserId
                                            } on ${new Date(
                                              lockedDayInfo[cell.date].lockedAt
                                            ).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                                              dateStyle: 'short',
                                            })}`
                                          : undefined
                                      }
                                    >
                                      {lockedDaySet.has(cell.date) && (
                                        <span className="text-rose-600" aria-hidden>
                                          🔒
                                        </span>
                                      )}
                                      {draftShift === 'MORNING'
                                        ? t('schedule.morning')
                                        : draftShift === 'EVENING'
                                        ? t('schedule.evening')
                                        : draftShift === 'COVER_RASHID_AM' || draftShift === 'COVER_RASHID_PM'
                                        ? (t('schedule.rashidCoverage') ?? t('schedule.coverRashidAm'))
                                        : '—'}
                                    </div>
                                  )}
                                </LuxuryTd>
                              );
                            })}
                          </tr>
                        ))}
                      {guestsBySource.map(([sourceId, { sourceBoutiqueName, guests: sourceGuests }]) => {
                        const byDate = new Map<string, GuestItem[]>();
                        for (const g of sourceGuests) {
                          const d = typeof g.date === 'string' ? g.date : (g.date as Date)?.toISOString?.()?.slice(0, 10) ?? '';
                          const list = byDate.get(d) ?? [];
                          list.push(g);
                          byDate.set(d, list);
                        }
                        return (
                          <tr key={sourceId || 'external'} className="border-t-2 border-slate-300 bg-slate-50">
                            <LuxuryTd className="sticky left-0 z-10 w-[18%] min-w-0 bg-slate-50 border-r border-slate-200 py-2 font-medium text-slate-700">
                              {sourceBoutiqueName} Coverage
                            </LuxuryTd>
                            {gridData.days.map((day) => {
                              const guests = byDate.get(day.date) ?? [];
                              const locked = !canEdit || lockedDaySet.has(day.date);
                              return (
                                <LuxuryTd key={day.date} className="w-[11.7%] min-w-0 align-top p-2">
                                  <div className="flex flex-col gap-1 items-start">
                                    {guests.length === 0 ? (
                                      <select disabled className="min-w-0 w-full max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-500">
                                        <option value="">—</option>
                                      </select>
                                    ) : (
                                      guests.map((g) => (
                                        <select
                                          key={g.id}
                                          value={g.id}
                                          onChange={(e) => {
                                            if (e.target.value === '__delete__') handleRemoveGuestShift(g.id);
                                          }}
                                          disabled={locked || removingGuestId === g.id}
                                          className="min-w-0 w-full max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                        >
                                          <option value="__delete__">—</option>
                                          <option value={g.id}>
                                            {g.employee.name} {g.shift === 'MORNING' ? 'AM' : 'PM'}
                                          </option>
                                        </select>
                                      ))
                                    )}
                                  </div>
                                </LuxuryTd>
                              );
                            })}
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 font-medium">
                        <LuxuryTd className="sticky left-0 z-10 bg-slate-100">AM</LuxuryTd>
                        {(draftCounts.length ? draftCounts : gridData.counts).map((c, i) => {
                          const day = gridData.days[i];
                          const am = c.amCount;
                          const pm = c.pmCount;
                          const amGtPm = am > pm;
                          const amLtMin = day && am < day.minAm;
                          const highlight = amGtPm || amLtMin;
                          return (
                            <LuxuryTd
                              key={gridData.days[i]?.date ?? i}
                              className={`text-center ${highlight ? 'bg-amber-100 text-amber-900' : ''}`}
                            >
                              {am}
                            </LuxuryTd>
                          );
                        })}
                      </tr>
                      <tr className="bg-slate-50 font-medium">
                        <LuxuryTd className="sticky left-0 z-10 bg-slate-100">PM</LuxuryTd>
                        {(draftCounts.length ? draftCounts : gridData.counts).map((c, i) => {
                          const am = c.amCount;
                          const pm = c.pmCount;
                          const amGtPm = am > pm;
                          return (
                            <LuxuryTd
                              key={gridData.days[i]?.date ?? i}
                              className={`text-center ${amGtPm ? 'bg-amber-100 text-amber-900' : ''}`}
                            >
                              {pm}
                            </LuxuryTd>
                          );
                        })}
                      </tr>
                    </LuxuryTableBody>
                  </LuxuryTable>
                </div>
              </div>
            ) : null}

            {editorView === 'excel' ? (
              <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                <ScheduleEditExcelViewClient
                  gridData={{
                    days: gridData.days,
                    rows: gridData.rows,
                    counts: draftCounts.length ? draftCounts : gridData.counts,
                  }}
                  weekGuests={externalGuests}
                  coverageHeaderLabel={coverageHeaderLabel}
                  onRemoveGuestShift={handleRemoveGuestShift}
                  removingGuestId={removingGuestId}
                  getDraftShift={getDraftShift}
                  getRowAndCell={getRowAndCell}
                  addPendingEdit={addPendingEdit}
                  canEdit={canEdit}
                  lockedDaySet={lockedDaySet}
                  formatDDMM={formatDDMM}
                  getDayName={(d: string) => getDayName(d, locale)}
                  getDayShort={(d: string) => getDayShort(d, locale)}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        )}

        {tab === 'week' && gridData && (
          <div className="mt-4 space-y-4">
            {canEdit && gridData?.suggestions && gridData.suggestions.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  {t('schedule.suggestions') ?? 'Suggestions'}
                </h3>
                <div className="mb-2 flex flex-wrap gap-1">
                  {gridData.suggestions.some((s) => s.type === 'MOVE' && !dismissedSuggestionIds.has(s.id)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuggestionConfirm(
                          gridData.suggestions!.find(
                            (s) => s.type === 'MOVE' && !dismissedSuggestionIds.has(s.id)
                          )!
                        )
                      }
                      className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-200"
                    >
                      {t('schedule.quickFixMoveAmPm') ?? 'Move 1 from AM → PM'}
                    </button>
                  )}
                  {gridData.suggestions.some((s) => s.type === 'REMOVE_COVER' && !dismissedSuggestionIds.has(s.id)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuggestionConfirm(
                          gridData.suggestions!.find(
                            (s) => s.type === 'REMOVE_COVER' && !dismissedSuggestionIds.has(s.id)
                          )!
                        )
                      }
                      className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                    >
                      {t('schedule.quickFixRemoveRashid') ?? 'Remove Rashid coverage'}
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {gridData.suggestions
                    .filter((s) => !dismissedSuggestionIds.has(s.id))
                    .map((s) => (
                      <li key={s.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                        <span className="font-medium text-slate-700">{formatDDMM(s.date)}</span>
                        <span className="ml-1 rounded bg-slate-200 px-1 py-0.5">{t(SUGGESTION_TYPE_KEYS[s.type] ?? '') || s.type}</span>
                        <p className="mt-1 text-slate-600">{s.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => suggestionPreview(s)}
                            className="rounded bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300"
                          >
                            {t('schedule.suggestionPreview') ?? 'Preview'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSuggestionConfirm(s)}
                            className="rounded bg-sky-600 px-2 py-1 text-white hover:bg-sky-700"
                          >
                            {t('schedule.suggestionApply') ?? 'Apply'}
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissSuggestion(s.id)}
                            className="rounded bg-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-400"
                          >
                            {t('schedule.suggestionDismiss') ?? 'Dismiss'}
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                {t('governance.auditThisWeek') ?? 'Audit (this week)'}
              </h3>
              {auditItems.length === 0 ? (
                <p className="text-xs text-slate-500">{t('governance.noAuditEntries') ?? 'No entries.'}</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {auditItems.slice(0, 10).map((item) => {
                    const expanded = auditExpanded.has(item.id);
                    const summary = formatAuditBeforeAfter(item.beforeJson, item.afterJson, t);
                    return (
                      <li
                        key={item.id}
                        className={`rounded px-2 py-1.5 ${auditActionColor(item.action)}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            setAuditExpanded((s) => {
                              const next = new Set(s);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          <span className="font-medium text-slate-800">
                            {t(AUDIT_ACTION_KEYS[item.action] ?? '') || item.action}
                          </span>
                          <span className="ml-1 text-slate-400">
                            {new Date(item.createdAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          <span className="ml-1 text-slate-500">{expanded ? '▼' : '▶'}</span>
                        </button>
                        {expanded && (
                          <div className="mt-1.5 space-y-0.5 border-l-2 border-slate-200 pl-1">
                            {item.actor && (
                              <p className="text-slate-600">
                                {item.actor.name}{' '}
                                <span className="text-slate-400">({getRoleDisplayLabel(item.actor.role as Role, null, t)})</span>
                              </p>
                            )}
                            {item.entityId && (
                              <p className="text-slate-600">
                                {t('governance.affected') ?? 'Affected'}: {item.entityId}
                              </p>
                            )}
                            {summary && <p className="text-slate-600">{summary}</p>}
                            {item.reason != null && item.reason !== '' && (
                              <p className="font-medium text-slate-700">{item.reason}</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <a
                href="/schedule/audit"
                className="mt-2 inline-block text-xs font-medium text-sky-600 hover:text-sky-700"
              >
                {t('governance.viewFullAudit') ?? 'View full audit →'}
              </a>
            </div>

            {canEdit && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('coverage.title')}</h3>
                <p className="mb-3 text-xs text-slate-600">
                  {(t('schedule.daysNeedingAttention') as string)?.replace?.(
                    '{n}',
                    String(daysNeedingAttention)
                  ) ?? `Days needing attention: ${daysNeedingAttention}`}
                </p>
                <ul className="space-y-2">
                  {validationsByDay.map(({ date, validations }) =>
                    validations.length > 0 ? (
                      <li key={date}>
                        <button
                          type="button"
                          onClick={() => focusDay(date)}
                          className="w-full rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-left text-sm text-amber-900 hover:bg-amber-100"
                        >
                          {formatDDMM(date)} {getDayName(date, locale)}
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {validations.map((v) => (
                              <span
                                key={v.type}
                                className={`inline rounded px-1.5 py-0.5 text-xs ${
                                  v.type === 'RASHID_OVERFLOW'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-200 text-amber-900'
                                }`}
                              >
                                {v.message}
                              </span>
                            ))}
                          </div>
                        </button>
                      </li>
                    ) : null
                  )}
                </ul>
                {daysNeedingAttention === 0 && (
                  <p className="text-sm text-slate-500">{t('coverage.noWarnings')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'month' && monthData && monthMode === 'summary' && (
          <div className="overflow-hidden">
            <LuxuryTable>
              <LuxuryTableHead>
                <LuxuryTh>{t('common.date')}</LuxuryTh>
                <LuxuryTh>AM</LuxuryTh>
                <LuxuryTh>PM</LuxuryTh>
                <LuxuryTh>{t('common.reason')}</LuxuryTh>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {monthData.days.map((day) => {
                  const hasWarnings = day.warnings.length > 0;
                  return (
                    <tr key={day.date}>
                      <LuxuryTd>
                        <span className="inline-flex items-center gap-1">
                          {formatDDMM(day.date)}
                          {hasWarnings && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
                              ⚠
                            </span>
                          )}
                        </span>
                      </LuxuryTd>
                      <LuxuryTd>{day.amCount}</LuxuryTd>
                      <LuxuryTd>{day.pmCount}</LuxuryTd>
                      <LuxuryTd className="text-amber-700">{day.warnings.length > 0 ? day.warnings.join('; ') : '—'}</LuxuryTd>
                    </tr>
                  );
                })}
              </LuxuryTableBody>
            </LuxuryTable>
          </div>
        )}

        {tab === 'month' && monthMode === 'excel' && (
          <>
            {monthExcelLoading && (
              <p className="text-slate-600">
                {typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}
              </p>
            )}
            {!monthExcelLoading && monthExcelData && (
              <div className="mt-2">
                <ScheduleEditMonthExcelViewClient
                  month={monthExcelData.month}
                  dayRows={monthExcelData.dayRows}
                  formatDDMM={formatDDMM}
                  t={t}
                />
              </div>
            )}
          </>
        )}

        {tab === 'week' && !gridData && (
          <p className="text-slate-600">{typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}</p>
        )}
      </div>

      {suggestionConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !saving && setSuggestionConfirm(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-slate-900">{t('schedule.suggestionApply') ?? 'Apply suggestion'}</h4>
            <p className="mt-2 text-sm text-slate-600">{suggestionConfirm.reason}</p>
            <ul className="mt-2 text-sm text-slate-700">
              {suggestionConfirm.affected.map((a) => (
                <li key={a.empId}>
                  {a.name}: {a.fromShift} → {a.toShift}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuggestionConfirm(null)}
                disabled={saving}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => applySuggestion(suggestionConfirm)}
                disabled={saving}
                className="h-9 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {saving ? '…' : (t('schedule.suggestionApply') ?? 'Apply')}
              </button>
            </div>
          </div>
        </>
      )}

      {saveModalOpen && canEdit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !saving && setSaveModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-slate-900">
              {(t('schedule.saveConfirmTitle') as string)?.replace?.('{n}', String(pendingCount)) ?? `Apply ${pendingCount} changes?`}
            </h4>
            <p className="mt-2 text-sm text-slate-600">{t('schedule.saveConfirmSubtitle') ?? 'Summary of changes:'}</p>
            <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              {Array.from(pendingEdits.entries()).map(([key, edit]) => {
                const [, date] = key.split('|');
                const from =
                  edit.originalEffectiveShift === 'MORNING'
                    ? 'AM'
                    : edit.originalEffectiveShift === 'EVENING'
                      ? 'PM'
                      : edit.originalEffectiveShift === 'COVER_RASHID_AM'
                        ? 'Rashid AM'
                        : edit.originalEffectiveShift === 'COVER_RASHID_PM'
                          ? 'Rashid PM'
                          : 'NONE';
                const to =
                  edit.newShift === 'MORNING'
                    ? 'AM'
                    : edit.newShift === 'EVENING'
                      ? 'PM'
                      : edit.newShift === 'COVER_RASHID_AM'
                        ? 'Rashid AM'
                        : edit.newShift === 'COVER_RASHID_PM'
                          ? 'Rashid PM'
                          : 'NONE';
                return (
                  <li key={key} className="flex justify-between gap-2 py-0.5">
                    <span className="text-slate-800">{formatDDMM(date)} {edit.employeeName}</span>
                    <span className="text-slate-600">{from} → {to}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">{t('common.reason')}</label>
              <input
                type="text"
                value={globalReason}
                onChange={(e) => setGlobalReason(e.target.value)}
                placeholder={t('editor.saveReasonPlaceholder') || DEFAULT_REASON}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                disabled={saving}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setSaveModalOpen(false)}
                disabled={saving}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={applyBatch}
                disabled={saving}
                className="h-9 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {saving ? `${saveProgress.done} / ${saveProgress.total}…` : (t('schedule.saveChanges') ?? 'Save changes')}
              </button>
            </div>
          </div>
        </>
      )}

      {addGuestOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !guestSubmitting && setAddGuestOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-slate-900">{t('schedule.addExternalCoverage') ?? 'Add External Coverage'}</h4>
            <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Source boutique</label>
                  <select
                    value={selectedSourceBoutiqueId}
                    onChange={(e) => setSelectedSourceBoutiqueId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={guestSubmitting}
                  >
                    <option value="">—</option>
                    {sourceBoutiques.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">{t('schedule.employee') ?? 'Employee'}</label>
                  <select
                    value={guestForm.empId}
                    onChange={(e) => setGuestForm((f) => ({ ...f, empId: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={guestSubmitting || guestLoading}
                  >
                    <option value="">{guestLoading ? '…' : '—'}</option>
                    {guestEmployees.map((e) => (
                      <option key={e.empId} value={e.empId}>
                        {e.empId} — {e.name}{e.boutiqueName ? ` (${e.boutiqueName})` : ''}
                      </option>
                    ))}
                  </select>
                  {guestError && (
                    <p className="mt-1 text-xs text-red-600">{guestError}</p>
                  )}
                  {!guestLoading && !guestError && guestEmployees.length === 0 && selectedSourceBoutiqueId && (
                    <p className="mt-1 text-xs text-slate-500">No external employees found.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">{t('schedule.day') ?? 'Day'}</label>
                  <select
                    value={weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0]}
                    onChange={(e) => setGuestForm((f) => ({ ...f, date: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={guestSubmitting}
                  >
                    {weekDates.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">{t('schedule.shift') ?? 'Shift'}</label>
                  <select
                    value={guestForm.shift}
                    onChange={(e) => setGuestForm((f) => ({ ...f, shift: e.target.value as 'MORNING' | 'EVENING' }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={guestSubmitting}
                  >
                    <option value="MORNING">{t('schedule.morning') ?? 'Morning'}</option>
                    <option value="EVENING">{t('schedule.evening') ?? 'Evening'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">{t('common.reason')}</label>
                  <input
                    type="text"
                    value={guestForm.reason}
                    onChange={(e) => setGuestForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder={t('schedule.guestReasonPlaceholder') || 'Coverage / branch visit'}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={guestSubmitting}
                  />
                </div>
              </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !guestSubmitting && setAddGuestOpen(false)}
                disabled={guestSubmitting}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={guestSubmitting || guestLoading || !guestForm.empId || !guestForm.date || !guestForm.reason.trim()}
                onClick={async () => {
                  const date = weekDates.includes(guestForm.date) ? guestForm.date : weekDates[0];
                  if (!guestForm.empId || !date || !guestForm.reason.trim()) return;
                  setGuestSubmitting(true);
                  try {
                    const res = await fetch('/api/overrides', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        empId: guestForm.empId,
                        date,
                        overrideShift: guestForm.shift,
                        reason: guestForm.reason.trim(),
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok || res.status === 202) {
                      setAddGuestOpen(false);
                      fetchGrid();
                      fetchGuests();
                      fetchWeekGovernance();
                      setToast(t('schedule.guestAdded') || 'Guest added to schedule');
                      setTimeout(() => setToast(null), 3000);
                    } else {
                      setToast((data.error as string) || 'Failed');
                      setTimeout(() => setToast(null), 4000);
                    }
                  } finally {
                    setGuestSubmitting(false);
                  }
                }}
                className="h-9 rounded-lg bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {guestSubmitting ? '…' : (t('schedule.add') ?? 'Add')}
              </button>
            </div>
          </div>
        </>
      )}

      {leaveConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
            <p className="text-sm font-medium leading-6 text-slate-800">
              {t('schedule.unsavedLeaveMessage') ?? 'You have unsaved changes. Leave anyway?'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeaveConfirm(null)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('schedule.stay') ?? 'Stay'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = leaveConfirm?.href ?? '';
                  setLeaveConfirm(null);
                  discardAll();
                  if (href) window.location.href = href;
                }}
                className="h-9 rounded-lg bg-amber-600 px-4 font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                {t('schedule.leaveAnyway') ?? 'Leave anyway'}
              </button>
            </div>
          </div>
        </>
      )}

      {lockDayModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !lockActionLoading && setLockDayModal(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
            <h4 className="text-lg font-semibold text-slate-900">{t('governance.lockDay')}</h4>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700">{t('schedule.day')} (YYYY-MM-DD)</label>
              <input
                type="date"
                value={lockDayModal.date}
                onChange={(e) => setLockDayModal((m) => (m ? { ...m, date: e.target.value } : null))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                disabled={lockActionLoading}
              />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700">{t('common.reason')}</label>
              <input
                type="text"
                value={lockDayModal.reason}
                onChange={(e) => setLockDayModal((m) => (m ? { ...m, reason: e.target.value } : null))}
                placeholder={t('governance.reasonOptional')}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                disabled={lockActionLoading}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !lockActionLoading && setLockDayModal(null)}
                disabled={lockActionLoading}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={lockActionLoading}
                onClick={async () => {
                  if (!lockDayModal) return;
                  setLockActionLoading(true);
                  try {
                    const res = await fetch('/api/schedule/lock', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scope: 'DAY', date: lockDayModal.date, reason: lockDayModal.reason.trim() || null }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                      setLockDayModal(null);
                      fetchWeekGovernance();
                      fetchGrid();
                      setToast(t('governance.dayLocked'));
                    } else setToast((data.error as string) || 'Failed');
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setLockActionLoading(false);
                  }
                }}
                className="h-9 rounded-lg bg-red-600 px-4 font-medium text-white hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {lockActionLoading ? '…' : t('governance.lockDay')}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          className="fixed bottom-4 end-4 z-50 rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-900 shadow"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
