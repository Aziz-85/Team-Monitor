'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LuxuryTable, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { NameChip } from '@/components/ui/NameChip';
import { ScheduleExcelViewClient } from '@/app/(dashboard)/schedule/excel/ScheduleExcelViewClient';
import { ScheduleMonthExcelViewClient } from '@/app/(dashboard)/schedule/excel/ScheduleMonthExcelViewClient';
import { ScheduleMobileView } from '@/components/schedule/ScheduleMobileView';
import { SCHEDULE_UI } from '@/lib/scheduleUi';
import { useI18n } from '@/app/providers';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { isDateInRamadanRange } from '@/lib/time/ramadan';
import { getVisibleSlotCount } from '@/lib/schedule/scheduleSlots';
import { getCoverageHeaderLabel } from '@/lib/schedule/coverageHeaderLabel';
import { normShift } from '@/lib/shiftNorm';

const VIEW_MODES = ['excel', 'grid', 'mobile'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

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

function parseWeekStartFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return weekStartSaturday(new Date().toISOString().slice(0, 10));
  return weekStartSaturday(value);
}

function currentMonthStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function formatMonthYear(monthStr: string, locale: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' });
}

type MonthDayRow = {
  date: string;
  dowLabel: string;
  isFriday: boolean;
  morningAssignees: string[];
  eveningAssignees: string[];
  rashidCoverage: Array<{ name: string; shift: 'AM' | 'PM' }>;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
  warnings: string[];
};

type MonthExcelData = {
  month: string;
  days: Array<{ date: string; dowLabel: string; isFriday: boolean }>;
  dayRows: MonthDayRow[];
};

type GridCell = {
  date: string;
  availability: string;
  effectiveShift: string;
  overrideId: string | null;
  baseShift: string;
};

type GridRow = { empId: string; name: string; team: string; cells: GridCell[] };

type GridDay = { date: string; dayName: string; dayOfWeek: number; minAm: number; minPm: number };

type GridData = {
  weekStart: string;
  days: GridDay[];
  rows: GridRow[];
  counts: Array<{
    amCount: number;
    pmCount: number;
    rashidAmCount?: number;
    rashidPmCount?: number;
  }>;
  integrityWarnings?: string[];
};

type ValidationResult = { type: string; message: string };

function parseViewParam(view: string | null): ViewMode {
  if (view === 'grid' || view === 'mobile') return view;
  return 'excel';
}

export function ScheduleViewClient({
  fullGrid,
  ramadanRange,
}: {
  fullGrid: boolean;
  ramadanRange?: { start: string; end: string } | null;
}) {
  const { messages, locale } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const [viewMode, setViewModeState] = useState<ViewMode>(() => parseViewParam(viewParam));
  const [weekStart, setWeekStart] = useState(() => parseWeekStartFromUrl(searchParams.get('weekStart')));
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [reminders, setReminders] = useState<Array<{ type: string; message: string; copyText: string }>>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [weekGuests, setWeekGuests] = useState<Array<{
    id: string;
    date: string;
    empId: string;
    shift: string;
    reason?: string;
    sourceBoutiqueId?: string;
    sourceBoutique?: { id: string; name: string } | null;
    employee: { name: string; homeBoutiqueCode: string; homeBoutiqueName?: string };
    /** true = from another boutique (show in External Coverage); false = same branch, do not show */
    isExternal?: boolean;
  }>>([]);
  const [weeklyInsights, setWeeklyInsights] = useState<{
    avgAm: number;
    avgPm: number;
    daysWithViolations: number;
    rashidCoverageTotal: number;
    mostAdjustedEmployee: { name: string; overrideCount: number } | null;
  } | null>(null);
  const [weekGovernance, setWeekGovernance] = useState<{
    weekStart: string;
    status: string;
    approvedByName?: string | null;
    approvedByRole?: string | null;
    approvedAt?: string | null;
    weekLock: { lockedByName: string | null; lockedByRole?: string | null; lockedAt: string } | null;
  } | null>(null);
  const [timeScope, setTimeScope] = useState<'week' | 'month'>(() =>
    searchParams.get('tab') === 'month' ? 'month' : 'week'
  );
  const [month, setMonth] = useState(() => {
    const p = searchParams.get('month');
    if (p && /^\d{4}-\d{2}$/.test(p)) return p;
    return currentMonthStr();
  });
  const [monthExcelData, setMonthExcelData] = useState<MonthExcelData | null>(null);
  const [monthExcelLoading, setMonthExcelLoading] = useState(false);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const dayRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const mobileDefaultAppliedRef = useRef(false);

  const refetchScopeLabel = useCallback(() => {
    if (!fullGrid) return;
    fetch('/api/me/operational-boutique')
      .then((r) => r.json().catch(() => null))
      .then((data: { label?: string } | null) => {
        setScopeLabel(data?.label ?? null);
      })
      .catch(() => setScopeLabel(null));
  }, [fullGrid]);

  useEffect(() => {
    if (!fullGrid) {
      setScopeLabel(null);
      return;
    }
    refetchScopeLabel();
  }, [fullGrid, refetchScopeLabel]);

  useEffect(() => {
    const onScopeChanged = () => {
      refetchScopeLabel();
      if (!fullGrid) return;
      if (weekStart) {
        setGridLoading(true);
        const params = new URLSearchParams({ weekStart });
        params.set('scope', 'all');
        if (teamFilter === 'A' || teamFilter === 'B') params.set('team', teamFilter);
        fetch(`/api/schedule/week/grid?${params}`, { cache: 'no-store' })
          .then((r) => r.json().catch(() => null))
          .then((data: GridData & { guestShifts?: typeof weekGuests; pendingGuestShifts?: typeof weekGuests } | null) => {
            const applied = Array.isArray(data?.guestShifts) ? data.guestShifts : [];
            const pending = Array.isArray(data?.pendingGuestShifts) ? data.pendingGuestShifts : [];
            const guests = [...applied, ...pending];
            if (process.env.NODE_ENV === 'development') {
              console.log('[grid] guestShifts.length', guests.length);
              console.log('[grid] guestShifts[0]', guests[0] ?? '(none)');
              if (guests.length > 0) {
                console.log('[grid] If UI still shows 0 → problem is 100% shift normalization/merge.');
              } else {
                console.log('[grid] length=0 → problem is 100% filtering/route response.');
              }
            }
            setGridData(data ?? null);
            setWeekGuests(guests);
          })
          .catch(() => {
            setGridData(null);
            setWeekGuests([]);
          })
          .finally(() => setGridLoading(false));
        fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => setWeekGovernance(data ?? null))
          .catch(() => setWeekGovernance(null));
        fetch(`/api/schedule/insights/week?weekStart=${weekStart}`, { cache: 'no-store' })
          .then((r) => r.json().catch(() => null))
          .then((data) => {
            if (data && typeof data.avgAm === 'number') {
              setWeeklyInsights({
                avgAm: data.avgAm,
                avgPm: data.avgPm,
                daysWithViolations: data.daysWithViolations ?? 0,
                rashidCoverageTotal: data.rashidCoverageTotal ?? 0,
                mostAdjustedEmployee: data.mostAdjustedEmployee
                  ? { name: data.mostAdjustedEmployee.name, overrideCount: data.mostAdjustedEmployee.overrideCount }
                  : null,
              });
            } else setWeeklyInsights(null);
          })
          .catch(() => setWeeklyInsights(null));
      }
      fetch('/api/schedule/reminders', { cache: 'no-store' })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => setReminders(data.reminders ?? []))
        .catch(() => setReminders([]));
    };
    window.addEventListener('scope-changed', onScopeChanged);
    return () => window.removeEventListener('scope-changed', onScopeChanged);
  }, [fullGrid, weekStart, teamFilter, refetchScopeLabel]);

  // Mobile: default to Grid View when Excel would be shown (avoid tiny vertical Excel on small screens)
  useEffect(() => {
    if (typeof window === 'undefined' || mobileDefaultAppliedRef.current) return;
    if (window.innerWidth > 768) return;
    const view = searchParams.get('view');
    const current = view === 'grid' ? view : 'excel';
    if (current === 'excel') {
      mobileDefaultAppliedRef.current = true;
      setViewModeState('grid');
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'grid');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!fullGrid) return;
    fetch('/api/schedule/reminders', { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => setReminders(data.reminders ?? []))
      .catch(() => setReminders([]));
  }, [fullGrid]);

  useEffect(() => {
    if (!fullGrid || !weekStart) return;
    fetch(`/api/schedule/week/status?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setWeekGovernance(data))
      .catch(() => setWeekGovernance(null));
  }, [fullGrid, weekStart]);

  useEffect(() => {
    if (!fullGrid || !weekStart) return;
    fetch(`/api/schedule/insights/week?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (data && typeof data.avgAm === 'number') {
          setWeeklyInsights({
            avgAm: data.avgAm,
            avgPm: data.avgPm,
            daysWithViolations: data.daysWithViolations ?? 0,
            rashidCoverageTotal: data.rashidCoverageTotal ?? 0,
            mostAdjustedEmployee: data.mostAdjustedEmployee
              ? { name: data.mostAdjustedEmployee.name, overrideCount: data.mostAdjustedEmployee.overrideCount }
              : null,
          });
        } else {
          setWeeklyInsights(null);
        }
      })
      .catch(() => setWeeklyInsights(null));
  }, [fullGrid, weekStart]);

  // Keep view in sync with URL
  useEffect(() => {
    setViewModeState(parseViewParam(searchParams.get('view')));
  }, [searchParams]);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'month') {
      setTimeScope('month');
      const m = searchParams.get('month');
      if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
    } else {
      setTimeScope('week');
    }
  }, [searchParams]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      const url = new URL(window.location.href);
      url.searchParams.set('view', mode);
      window.history.replaceState({}, '', url.pathname + url.search);
    },
    []
  );

  const fetchGrid = useCallback(() => {
    const params = new URLSearchParams({ weekStart });
    if (fullGrid) params.set('scope', 'all');
    if (teamFilter === 'A' || teamFilter === 'B') params.set('team', teamFilter);
    return fetch(`/api/schedule/week/grid?${params}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((data: GridData & { guestShifts?: typeof weekGuests; pendingGuestShifts?: typeof weekGuests } | null) => {
        const applied = Array.isArray(data?.guestShifts) ? data.guestShifts : [];
        const pending = Array.isArray(data?.pendingGuestShifts) ? data.pendingGuestShifts : [];
        const guests = [...applied, ...pending];
        if (process.env.NODE_ENV === 'development') {
          console.log('[grid] guestShifts.length', guests.length);
          console.log('[grid] guestShifts[0]', guests[0] ?? '(none)');
          if (guests.length > 0) {
            console.log('[grid] If UI still shows 0 → problem is 100% shift normalization/merge.');
          } else {
            console.log('[grid] length=0 → problem is 100% filtering/route response.');
          }
        }
        setGridData(data ?? null);
        setWeekGuests(guests);
      })
      .catch(() => {
        setGridData(null);
        setWeekGuests([]);
      });
  }, [weekStart, fullGrid, teamFilter]);

  useEffect(() => {
    setGridLoading(true);
    fetchGrid().finally(() => setGridLoading(false));
  }, [fetchGrid]);

  useEffect(() => {
    if (timeScope !== 'month' || !month) return;
    setMonthExcelLoading(true);
    const params = new URLSearchParams({ month, locale: locale === 'ar' ? 'ar' : 'en' });
    fetch(`/api/schedule/month/excel?${params}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMonthExcelData)
      .catch(() => setMonthExcelData(null))
      .finally(() => setMonthExcelLoading(false));
  }, [timeScope, month, locale]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (timeScope === 'month') {
      params.set('tab', 'month');
      params.set('month', month);
    } else {
      params.set('weekStart', weekStart);
      params.delete('tab');
      params.delete('month');
    }
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (typeof window !== 'undefined' && (window.location.pathname + (window.location.search || '')) !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [pathname, searchParams, weekStart, timeScope, month]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWeekStart((ws) => addDays(ws, -7));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWeekStart((ws) => addDays(ws, 7));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const validationsByDay = useMemo(
    (): Array<{ date: string; validations: ValidationResult[] }> =>
      gridData?.days.map((day, i) => {
        const count = gridData.counts[i];
        const am = count?.amCount ?? 0;
        const pm = count?.pmCount ?? 0;
        const minAm = day.minAm ?? 2;
        const minPm = day.minPm ?? 0;
        const isFriday = day.dayOfWeek === 5;
        const validations: ValidationResult[] = [];
        const effectiveMinAm = !isFriday ? Math.max(minAm ?? 2, 2) : 0;
        if (am > pm) validations.push({ type: 'RASHID_OVERFLOW', message: t('schedule.warningRashidOverflow') });
        if (!isFriday && effectiveMinAm > 0 && am < effectiveMinAm) validations.push({ type: 'MIN_AM', message: t('schedule.minAmTwo') });
        if (minPm > 0 && pm < minPm) validations.push({ type: 'MIN_PM', message: t('schedule.warningMinPm') });
        return { date: day.date, validations };
      }) ?? [],
    [gridData, t]
  );

  const focusDay = useCallback((date: string) => {
    const el = dayRefs.current[date];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      el.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
    }
  }, []);

  // Week totals for badges (boutique only; Rashid optional)
  const weekTotals = useMemo(() => {
    if (!gridData?.counts) return { totalAm: 0, totalPm: 0, totalRashidAm: 0, totalRashidPm: 0 };
    let totalAm = 0;
    let totalPm = 0;
    let totalRashidAm = 0;
    let totalRashidPm = 0;
    for (const c of gridData.counts) {
      totalAm += c?.amCount ?? 0;
      totalPm += c?.pmCount ?? 0;
      totalRashidAm += c?.rashidAmCount ?? 0;
      totalRashidPm += c?.rashidPmCount ?? 0;
    }
    return { totalAm, totalPm, totalRashidAm, totalRashidPm };
  }, [gridData]);

  /** Only guests from other boutiques (show in External Coverage); same-branch excluded */
  const externalGuests = useMemo(
    () => (weekGuests ?? []).filter((g) => g.isExternal !== false),
    [weekGuests]
  );

  const coverageHeaderLabel = useMemo(
    () =>
      getCoverageHeaderLabel(externalGuests, {
        rashidLabel: t('schedule.rashidCoverage') ?? 'Rashid Coverage',
        externalLabel: t('schedule.externalCoverage') ?? 'External Coverage',
      }),
    [externalGuests, t]
  );

  /** External coverage by day (YYYY-MM-DD). Only external guests. */
  const guestsByDay = useMemo(() => {
    const map: Record<string, { am: Array<{ id: string; name: string }>; pm: Array<{ id: string; name: string }> }> = {};
    const list = externalGuests;
    for (const g of list) {
      const dateKey = g.date;
      const shiftNorm = normShift(g.shift);
      if (shiftNorm === null) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[View] Unknown shift, guest not dropped:', g.shift, g);
        }
        continue;
      }
      if (!map[dateKey]) map[dateKey] = { am: [], pm: [] };
      const baseName = g.employee?.name ?? g.empId ?? '';
      const name = (g as { pending?: boolean }).pending ? `${baseName} (${t('schedule.pendingApproval') ?? 'في انتظار الموافقة'})` : baseName;
      const item = { id: g.id, name };
      if (shiftNorm === 'AM') map[dateKey].am.push(item);
      else map[dateKey].pm.push(item);
    }
    if (process.env.NODE_ENV === 'development' && list.length > 0) {
      console.log('[View] guestShifts sample', list.slice(0, 3));
      console.log('[View] guestsByDay keys', Object.keys(map).slice(0, 7));
    }
    return map;
  }, [externalGuests, t]);

  // Excel view: per-day lists by shift (boutique AM/PM); external coverage from guestsByDay
  const excelData = useMemo(() => {
    if (!gridData) return null;
    const morningByDay: string[][] = [];
    const eveningByDay: string[][] = [];
    const rashidAmByDay: string[][] = [];
    const rashidPmByDay: string[][] = [];
    for (let i = 0; i < 7; i++) {
      const morning: string[] = [];
      const evening: string[] = [];
      const rashidAm: string[] = [];
      const rashidPm: string[] = [];
      for (const row of gridData.rows) {
        const cell = row.cells[i];
        if (cell.availability !== 'WORK') continue;
        if (cell.effectiveShift === 'MORNING') morning.push(row.name);
        if (cell.effectiveShift === 'EVENING') evening.push(row.name);
        if (cell.effectiveShift === 'COVER_RASHID_AM') rashidAm.push(row.name);
        if (cell.effectiveShift === 'COVER_RASHID_PM') rashidPm.push(row.name);
      }
      morningByDay.push(morning);
      eveningByDay.push(evening);
      rashidAmByDay.push(rashidAm);
      rashidPmByDay.push(rashidPm);
    }
    const morningSlots = Math.max(2, ...morningByDay.map((a) => a.length));
    const eveningSlots = Math.max(2, ...eveningByDay.map((a) => a.length));
    const rashidAmSlots = Math.max(1, ...rashidAmByDay.map((a) => a.length));
    const rashidPmSlots = Math.max(1, ...rashidPmByDay.map((a) => a.length));
    return {
      morningByDay,
      eveningByDay,
      rashidAmByDay,
      rashidPmByDay,
      morningSlots,
      eveningSlots,
      rashidAmSlots,
      rashidPmSlots,
    };
  }, [gridData]);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-7xl px-3 md:px-4">
        {!fullGrid && (
          <div className="mt-3 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" role="status">
            {t('governance.viewOnlyBanner') ?? 'This schedule is view-only.'}
          </div>
        )}
        {/* Week/Month scope + view mode tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label={t('schedule.week') ?? 'Week'}>
            <button
              type="button"
              role="tab"
              aria-selected={timeScope === 'week'}
              onClick={() => setTimeScope('week')}
              className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
                timeScope === 'week' ? 'bg-white text-slate-900 shadow-sm border border-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('schedule.week')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeScope === 'month'}
              onClick={() => setTimeScope('month')}
              className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
                timeScope === 'month' ? 'bg-white text-slate-900 shadow-sm border border-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('schedule.month')}
            </button>
          </div>
          {timeScope === 'week' && (
            <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`min-w-[5rem] h-full rounded-md px-3 text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mode === 'excel'
                    ? t('schedule.excelView')
                    : mode === 'grid'
                      ? t('schedule.gridView')
                      : t('schedule.mobileView')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* schedule-header: left = week nav + title + badges, right = stat pills */}
        <div className="schedule-header mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {timeScope === 'week' && (
              <>
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  disabled={gridLoading}
                  title={t('schedule.previousWeek')}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.previousWeek')}
                >
                  <span aria-hidden>◀</span>
                </button>
                <span className="text-lg font-bold text-slate-900">
                  {(t('schedule.weekOf') ?? 'Week of {start} – {end}')
                    .replace('{start}', formatWeekRangeLabel(weekStart, locale).start)
                    .replace('{end}', formatWeekRangeLabel(weekStart, locale).end)}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  disabled={gridLoading}
                  title={t('schedule.nextWeek')}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.nextWeek')}
                >
                  <span aria-hidden>▶</span>
                </button>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(weekStartSaturday(e.target.value))}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={t('schedule.week')}
                />
                {timeScope === 'week' && fullGrid && ramadanRange && (() => {
                  const weekInRamadan = gridData?.days?.some((d: { date: string }) => isDateInRamadanRange(new Date(d.date + 'T12:00:00Z'), ramadanRange!)) ?? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).some((d) => isDateInRamadanRange(new Date(d + 'T12:00:00Z'), ramadanRange!));
                  return weekInRamadan ? (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">
                      {t('schedule.ramadanModeBanner')}
                    </span>
                  ) : null;
                })()}
                {timeScope === 'week' && fullGrid && weekGovernance && (
                  <>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${weekGovernance.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-100 text-emerald-900' : 'border-slate-200 bg-slate-100 text-slate-700'}`}
                      title={
                        weekGovernance.status === 'DRAFT'
                          ? (t('governance.tooltipDraft') ?? 'Draft')
                          : weekGovernance.approvedByName && weekGovernance.approvedAt
                            ? `${t('governance.approvedBy') ?? 'Approved by'} ${weekGovernance.approvedByName}${weekGovernance.approvedByRole ? ` (${weekGovernance.approvedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.approvedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                            : t('governance.tooltipApproved')
                      }
                    >
                      {weekGovernance.status === 'DRAFT' ? t('governance.draft') : t('governance.approved')}
                    </span>
                    {weekGovernance.weekLock && (
                      <span
                        className="inline-flex items-center rounded-full border border-red-200 bg-red-100 px-3 py-1.5 text-sm font-medium text-red-900"
                        title={
                          weekGovernance.weekLock.lockedByName && weekGovernance.weekLock.lockedAt
                            ? `${t('governance.lockedBy')} ${weekGovernance.weekLock.lockedByName}${weekGovernance.weekLock.lockedByRole ? ` (${weekGovernance.weekLock.lockedByRole})` : ''} ${t('common.on') ?? 'on'} ${new Date(weekGovernance.weekLock.lockedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short' })}`
                            : t('governance.tooltipLocked')
                        }
                      >
                        🔒 {t('governance.locked') ?? 'Locked'}
                      </span>
                    )}
                  </>
                )}
              </>
            )}
            {timeScope === 'month' && (
              <>
                <button
                  type="button"
                  onClick={() => setMonth(addMonths(month, -1))}
                  disabled={monthExcelLoading}
                  title={t('schedule.previousMonth')}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.previousMonth')}
                >
                  <span aria-hidden>◀</span>
                </button>
                <span className="min-w-[180px] text-lg font-bold text-slate-900">
                  {formatMonthYear(month, locale)}
                </span>
                <button
                  type="button"
                  onClick={() => setMonth(addMonths(month, 1))}
                  disabled={monthExcelLoading}
                  title={t('schedule.nextMonth')}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label={t('schedule.nextMonth')}
                >
                  <span aria-hidden>▶</span>
                </button>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={t('schedule.month')}
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {timeScope === 'week' && fullGrid && reminders.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRemindersOpen((o) => !o)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('schedule.reminders') ?? 'Reminders'} ({reminders.length})
                </button>
                {remindersOpen && (
                  <>
                    <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3">
                      {reminders.map((r, i) => (
                        <p key={i} className="border-b border-slate-100 py-1 text-xs text-slate-700 last:border-0">
                          {r.message}
                        </p>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const text = reminders.map((r) => r.copyText).join('\n');
                          void navigator.clipboard.writeText(text);
                          setRemindersOpen(false);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {t('schedule.copyReminders') ?? 'Copy all (WhatsApp)'}
                      </button>
                    </div>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setRemindersOpen(false)} />
                  </>
                )}
              </div>
            )}
            {timeScope === 'week' && fullGrid && (
              <>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-sky-800">
                  {t('schedule.totalAm')}: {weekTotals.totalAm}
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-amber-800">
                  {t('schedule.totalPm')}: {weekTotals.totalPm}
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {`Total ${coverageHeaderLabel}`}: {externalGuests.length}
                </span>
                {process.env.NODE_ENV === 'development' && (
                  <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800" title="Dev: guestShifts from grid">
                    Guests: {externalGuests.length}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {timeScope === 'week' && fullGrid && weeklyInsights && (
          <div className="mt-4 mb-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('schedule.insights') ?? 'Insights'}</span>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {t('schedule.insightsAvgAm') ?? 'Avg AM'}: {weeklyInsights.avgAm}
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {t('schedule.insightsAvgPm') ?? 'Avg PM'}: {weeklyInsights.avgPm}
            </span>
            <span className={`rounded-lg border px-3 py-1.5 text-sm ${weeklyInsights.daysWithViolations > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}>
              {t('schedule.insightsDaysViolations') ?? 'Days with violations'}: {weeklyInsights.daysWithViolations}
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              {`Total ${coverageHeaderLabel}`}: {externalGuests.length}
            </span>
            {weeklyInsights.mostAdjustedEmployee && (
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600" title={t('schedule.insightsMostAdjustedHint') ?? 'Most overrides this week'}>
                {t('schedule.insightsMostAdjusted') ?? 'Most adjusted'}: {weeklyInsights.mostAdjustedEmployee.name} ({weeklyInsights.mostAdjustedEmployee.overrideCount})
              </span>
            )}
          </div>
        )}

        {timeScope === 'month' && (
          <>
            {monthExcelLoading && (
              <p className="text-slate-600">
                {typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}
              </p>
            )}
            {!monthExcelLoading && monthExcelData && (
              <ScheduleMonthExcelViewClient
                month={monthExcelData.month}
                dayRows={monthExcelData.dayRows}
                formatDDMM={formatDDMM}
                t={t}
              />
            )}
          </>
        )}

        {timeScope === 'week' && fullGrid && viewMode !== 'excel' && (
          <div className="mt-6">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-base"
            >
              <option value="">{t('schedule.allTeams') ?? 'All teams'}</option>
              <option value="A">{t('schedule.teamA') ?? 'Team A'}</option>
              <option value="B">{t('schedule.teamB') ?? 'Team B'}</option>
            </select>
          </div>
        )}

        {timeScope === 'week' && fullGrid && gridData?.integrityWarnings && gridData.integrityWarnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <span className="font-medium">{t('schedule.fridayPmOnly')}</span>
            <span className="ml-1">— {gridData.integrityWarnings.join('; ')}</span>
          </div>
        )}

        {timeScope === 'week' && fullGrid && scopeLabel && (
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-medium">{t('schedule.dataScopeBanner') ?? 'Data scope'}:</span> Boutique: {scopeLabel}
          </p>
        )}
        {timeScope === 'week' && fullGrid && scopeLabel && (
          <p className="mt-1 text-xs text-slate-500">{t('schedule.filteredByBoutiqueHint')}</p>
        )}

        {timeScope === 'week' && !gridData && (
          <p className="text-slate-600">
            {typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}
          </p>
        )}

        {timeScope === 'week' && gridData && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-500">{t('schedule.coverage') ?? 'Shifts'}:</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 font-medium text-sky-800">
              <span className="h-4 w-4 rounded-full bg-sky-200" aria-hidden />
              {t('schedule.morning')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-900">
              <span className="h-4 w-4 rounded-full bg-amber-200" aria-hidden />
              {t('schedule.evening')}
            </span>
            {fullGrid && (
              <>
                <span className="ml-2 font-medium text-slate-500">{t('governance.weekStatus') ?? 'Status'}:</span>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{t('governance.draft')}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">{t('governance.approved')}</span>
                <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 font-medium text-red-900">🔒 {t('governance.locked')}</span>
              </>
            )}
          </div>
        )}

        {timeScope === 'week' && gridData && viewMode === 'excel' && excelData && (() => {
          const { visibleSlots, maxPerCell } = getVisibleSlotCount({
            morningByDay: excelData.morningByDay,
            eveningByDay: excelData.eveningByDay,
          });
          return (
            <div className="mt-6">
            <ScheduleExcelViewClient
              gridData={gridData}
              excelData={excelData}
              guestsByDay={guestsByDay}
              coverageHeaderLabel={coverageHeaderLabel}
              visibleSlots={visibleSlots}
              maxPerCell={maxPerCell}
              showMaxColumnsWarning={fullGrid}
              formatDDMM={formatDDMM}
              getDayName={(d: string) => getDayName(d, locale)}
              getDayShort={(d: string) => getDayShort(d, locale)}
              t={t}
            />
            </div>
          );
        })()}

        {timeScope === 'week' && gridData && viewMode === 'grid' && (
          <ScheduleGridView
            gridData={gridData}
            dayRefs={dayRefs}
            formatDDMM={formatDDMM}
            getDayName={(d: string) => getDayName(d, locale)}
            t={t}
            fullGrid={fullGrid}
            validationsByDay={validationsByDay}
            focusDay={focusDay}
            weekGuests={externalGuests}
          />
        )}

        {timeScope === 'week' && gridData && viewMode === 'mobile' && (
          <ScheduleMobileView
            gridData={gridData}
            guestsByDay={guestsByDay}
            formatDDMM={formatDDMM}
            getDayName={(d: string) => getDayName(d, locale)}
            t={t}
            locale={locale}
          />
        )}

      </div>
    </div>
  );
}

// Fix: byDayTeam should be one entry per day (Team A + Team B combined). So byDayTeam[dayIdx] should be { teamA: { am, pm }, teamB: { am, pm } }.
// I built byDayTeam as [day0A, day0B, day1A, day1B, ...] so dayIdx*2 and dayIdx*2+1 are wrong for day 1 (we get day1A and day1B but they're stored at index 2 and 3). So for day 0: teamA = byDayTeam[0], teamB = byDayTeam[1]. For day 1: teamA = byDayTeam[2], teamB = byDayTeam[3]. So byDayTeam has length 14 (7*2). That's correct: byDayTeam[dayIdx*2] = Team A for day dayIdx, byDayTeam[dayIdx*2+1] = Team B for day dayIdx. So the code is correct. But wait - we're building one object per team per day: we push { am, pm } for team A and then { am, pm } for team B. So byDayTeam = [ day0TeamA, day0TeamB, day1TeamA, day1TeamB, ... ]. Yes, correct.

// --- Grid View: employee rows × days, read-only, count row on top; External Coverage row per day ---
function ScheduleGridView({
  gridData,
  dayRefs,
  formatDDMM,
  getDayName,
  t,
  fullGrid,
  validationsByDay,
  focusDay,
  weekGuests = [],
}: {
  gridData: GridData;
  dayRefs: React.MutableRefObject<Record<string, HTMLTableCellElement | null>>;
  formatDDMM: (d: string) => string;
  getDayName: (d: string) => string;
  t: (k: string) => string;
  fullGrid: boolean;
  validationsByDay: Array<{ date: string; validations: ValidationResult[] }>;
  focusDay: (date: string) => void;
  weekGuests?: Array<{ id: string; date: string; empId: string; shift: string; reason?: string; sourceBoutiqueId?: string; sourceBoutique?: { id: string; name: string } | null; employee: { name: string; homeBoutiqueCode: string; homeBoutiqueName?: string } }>;
}) {
  const { days, rows, counts } = gridData;
  const guestsBySource = useMemo(() => {
    const list = weekGuests ?? [];
    const bySource = new Map<string, { sourceBoutiqueName: string; guests: typeof list }>();
    for (const g of list) {
      const sid = g.sourceBoutiqueId ?? '';
      const name = g.sourceBoutique?.name ?? g.employee.homeBoutiqueName ?? 'External';
      const existing = bySource.get(sid);
      if (existing) existing.guests.push(g);
      else bySource.set(sid, { sourceBoutiqueName: name, guests: [g] });
    }
    return Array.from(bySource.entries()).sort((a, b) => a[1].sourceBoutiqueName.localeCompare(b[1].sourceBoutiqueName));
  }, [weekGuests]);
  return (
    <>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">{t('coverage.title')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {days.map((day, i) => {
            const count = counts[i];
            const am = count?.amCount ?? 0;
            const pm = count?.pmCount ?? 0;
            const minAm = day.minAm ?? 2;
            const amGtPm = am > pm;
            const amLtMin = minAm > 0 && am < minAm;
            const hasWarning = amGtPm || amLtMin;
            return (
              <div
                key={day.date}
                className={`rounded-lg border px-3 py-1.5 text-sm ${hasWarning ? 'border-amber-200 bg-amber-100 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
              >
                <span className="font-semibold">{formatDDMM(day.date)}</span>
                <span className="ml-2">
                  AM: {am} / PM: {pm}
                </span>
                {amGtPm && (
                  <span className="ml-1.5 inline-flex items-center rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-900">AM&gt;PM</span>
                )}
                {amLtMin && !amGtPm && (
                  <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">AM&lt;Min</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden">
        <LuxuryTable>
          <thead>
            {/* Count row on top */}
            <tr className={`${SCHEDULE_UI.headerRow} text-center`}>
              {fullGrid && <LuxuryTh className="sticky left-0 z-10 w-12 bg-slate-100 border-r border-slate-200"></LuxuryTh>}
              <LuxuryTh className="sticky left-0 z-10 min-w-[100px] bg-slate-100 border-r border-slate-200 font-medium">
                {t('schedule.amCount')} / {t('schedule.pmCount')}
              </LuxuryTh>
              {days.map((day, i) => (
                <LuxuryTh key={day.date} className="min-w-[88px] text-center font-medium">
                  {counts[i]?.amCount ?? 0} / {counts[i]?.pmCount ?? 0}
                </LuxuryTh>
              ))}
            </tr>
            <tr className={`${SCHEDULE_UI.headerRow} text-left`}>
              {fullGrid && (
                <LuxuryTh className="sticky left-0 z-10 w-12 bg-slate-100 text-center border-r border-slate-200">
                  {t('schedule.team') ?? 'Team'}
                </LuxuryTh>
              )}
              <LuxuryTh className="sticky left-0 z-10 min-w-[100px] bg-slate-100 border-r border-slate-200">
                {fullGrid ? t('schedule.day') : t('schedule.employee') ?? 'Employee'}
              </LuxuryTh>
              {days.map((day) => (
                <LuxuryTh
                  key={day.date}
                  ref={(el) => {
                    dayRefs.current[day.date] = el;
                  }}
                  className="min-w-[88px] text-center"
                >
                  <div className="font-medium">{getDayName(day.date)}</div>
                  <div className="text-xs text-slate-500">{formatDDMM(day.date)}</div>
                </LuxuryTh>
              ))}
            </tr>
          </thead>
          <LuxuryTableBody>
            {rows.map((row) => (
              <tr key={row.empId}>
                {fullGrid && (
                  <LuxuryTd className="sticky left-0 z-10 w-12 bg-white text-center text-sm font-medium text-slate-600">
                    {row.team}
                  </LuxuryTd>
                )}
                <LuxuryTd className="sticky left-0 z-10 min-w-[100px] bg-white font-medium">
                  <NameChip name={row.name} empId={row.empId} variant="rashid" />
                </LuxuryTd>
                {row.cells.map((cell) => {
                  const locked = cell.availability !== 'WORK';
                  return (
                    <LuxuryTd key={cell.date} className="min-w-[88px] p-0 align-middle">
                      {locked ? (
                        <div className={`flex h-9 items-center justify-center bg-slate-100 px-2 text-center ${SCHEDULE_UI.guestLine} text-slate-500`}>
                          {cell.availability === 'LEAVE'
                            ? t('leaves.title')
                            : cell.availability === 'OFF'
                              ? t('common.offDay')
                              : t('inventory.absent')}
                        </div>
                      ) : (
                        <div className="flex h-9 items-center justify-center px-2 text-sm">
                          {cell.effectiveShift === 'MORNING'
                            ? t('schedule.morning')
                            : cell.effectiveShift === 'EVENING'
                              ? t('schedule.evening')
                              : cell.effectiveShift === 'COVER_RASHID_AM'
                                ? t('schedule.coverRashidAm')
                                : cell.effectiveShift === 'COVER_RASHID_PM'
                                  ? t('schedule.coverRashidPm')
                                  : '—'}
                        </div>
                      )}
                    </LuxuryTd>
                  );
                })}
              </tr>
            ))}
            {guestsBySource.map(([sourceId, { sourceBoutiqueName, guests: sourceGuests }]) => {
              const byDate = new Map<string, typeof sourceGuests>();
              for (const g of sourceGuests) {
                const list = byDate.get(g.date) ?? [];
                list.push(g);
                byDate.set(g.date, list);
              }
              return (
                <tr key={sourceId || 'external'} className="border-t-2 border-slate-300 bg-slate-50">
                  {fullGrid && <LuxuryTd className="sticky left-0 z-10 w-12 bg-slate-50 border-r border-slate-200" />}
                  <LuxuryTd className="sticky left-0 z-10 min-w-[100px] bg-slate-50 border-r border-slate-200 py-2 font-medium text-slate-700">
                    {sourceBoutiqueName} Coverage
                  </LuxuryTd>
                  {days.map((day) => {
                    const guests = byDate.get(day.date) ?? [];
                    return (
                      <LuxuryTd key={day.date} className="min-w-[88px] p-2 align-top">
                        <div className="space-y-1.5">
                          {guests.map((g) => (
                            <div key={g.id} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                              <span className="font-medium text-slate-800">{g.employee.name}</span>
                              <span className="ml-1 font-medium text-slate-700">
                                {g.shift === 'MORNING' || g.shift === 'AM' ? ' AM' : ' PM'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </LuxuryTd>
                    );
                  })}
                </tr>
              );
            })}
          </LuxuryTableBody>
        </LuxuryTable>
      </div>
      {fullGrid && validationsByDay.some((d) => d.validations.length > 0) && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-amber-900">
            {(t('schedule.daysNeedingAttention') as string)?.replace?.(
              '{n}',
              String(validationsByDay.filter((d) => d.validations.length > 0).length)
            ) ?? 'Days needing attention'}
          </h4>
          <ul className="space-y-2">
            {validationsByDay.map(
              ({ date, validations }) =>
                validations.length > 0 && (
                  <li key={date}>
                    <button
                      type="button"
                      onClick={() => focusDay(date)}
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                    >
                      <span className="font-medium">{formatDDMM(date)} {getDayName(date)}:</span>{' '}
                      {validations.map((v) => v.message).join('; ')}
                    </button>
                  </li>
                )
            )}
          </ul>
        </div>
      )}
    </>
  );
}
