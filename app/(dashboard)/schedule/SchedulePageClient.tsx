'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { ScheduleExcelViewClient } from '@/app/(dashboard)/schedule/excel/ScheduleExcelViewClient';
import { useI18n } from '@/app/providers';
import { computeCountsFromGridRows } from '@/lib/services/scheduleGrid';
import { getVisibleSlotCount } from '@/lib/schedule/scheduleSlots';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { getFirstName } from '@/lib/name';

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

function parseWeekStartFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return weekStartSaturday(new Date().toISOString().slice(0, 10));
  return weekStartSaturday(value);
}

function parseMonthFromUrl(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return new Date().toISOString().slice(0, 7);
  return value;
}

function editKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

type GridCell = {
  date: string;
  availability: string;
  effectiveShift: string;
  overrideId: string | null;
  baseShift: string;
};

type GridRow = { empId: string; name: string; cells: GridCell[] };

type GridDay = { date: string; dayName: string; dayOfWeek: number; minAm: number; minPm: number };

type GridData = {
  weekStart: string;
  days: GridDay[];
  rows: GridRow[];
  counts: Array<{ amCount: number; pmCount: number }>;
};

type MonthData = {
  month: string;
  days: Array<{ date: string; amCount: number; pmCount: number; warnings: string[] }>;
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
const SAVE_CONCURRENCY = 5;

export function SchedulePageClient({ canEdit }: { canEdit: boolean }) {
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
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [globalReason, setGlobalReason] = useState(DEFAULT_REASON);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState<{ href: string } | null>(null);
  const [viewMode, setViewModeState] = useState<'modern' | 'excel'>('modern');
  const [showBanner, setShowBanner] = useState(true);
  const dayRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('schedule_view') : null;
    if (saved === 'modern' || saved === 'excel') setViewModeState(saved);
  }, []);

  const setViewMode = useCallback((mode: 'modern' | 'excel') => {
    setViewModeState(mode);
    if (typeof window !== 'undefined') localStorage.setItem('schedule_view', mode);
  }, []);

  const fetchGrid = useCallback(() => {
    return fetch(`/api/schedule/week/grid?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then(setGridData)
      .catch(() => setGridData(null));
  }, [weekStart]);

  useEffect(() => {
    if (tab === 'week') {
      setGridLoading(true);
      fetchGrid().finally(() => setGridLoading(false));
    }
  }, [tab, fetchGrid]);

  useEffect(() => {
    setPendingEdits(new Map());
  }, [weekStart]);

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
    const params = new URLSearchParams();
    if (tab === 'week') params.set('weekStart', weekStart);
    else params.set('month', month);
    const q = params.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (typeof window !== 'undefined' && (window.location.pathname + (window.location.search || '')) !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [pathname, tab, weekStart, month]);

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

  const pendingCount = pendingEdits.size;

  const getDraftShift = useCallback(
    (empId: string, date: string, serverEffective: string): string => {
      const edit = pendingEdits.get(editKey(empId, date));
      return edit ? edit.newShift : serverEffective;
    },
    [pendingEdits]
  );

  const draftCounts = useMemo((): Array<{ amCount: number; pmCount: number }> => {
    if (!gridData?.rows.length) return [];
    const dayCounts = computeCountsFromGridRows(gridData.rows, getDraftShift);
    return dayCounts.map((c) => ({ amCount: c.amCount, pmCount: c.pmCount }));
  }, [gridData, getDraftShift]);

  const validationsByDay = useMemo(
    (): Array<{ date: string; validations: ValidationResult[] }> =>
      gridData?.days.map((day, i) => {
        const count = draftCounts[i] ?? gridData.counts[i];
        const am = count?.amCount ?? 0;
        const pm = count?.pmCount ?? 0;
        const effectiveMinAm = day.dayOfWeek === 5 ? 0 : Math.max(day.minAm ?? 2, 2);
        const validations: ValidationResult[] = [];
        if (am > pm) validations.push({ type: 'AM_GT_PM', message: `AM (${am}) > PM (${pm})`, amCount: am, pmCount: pm });
        if (effectiveMinAm > 0 && am < effectiveMinAm) validations.push({ type: 'MIN_AM', message: `AM (${am}) < ${effectiveMinAm}`, amCount: am, pmCount: pm, minAm: effectiveMinAm });
        return { date: day.date, validations };
      }) ?? [],
    [gridData, draftCounts]
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

  const excelData = useMemo(() => {
    if (!gridData) return null;
    const morningByDay: string[][] = [];
    const eveningByDay: string[][] = [];
    const rashidAmByDay: string[][] = [];
    const rashidPmByDay: string[][] = [];
    for (let i = 0; i < gridData.days.length; i++) {
      const morning: string[] = [];
      const evening: string[] = [];
      const rashidAm: string[] = [];
      const rashidPm: string[] = [];
      for (const row of gridData.rows) {
        const cell = row.cells[i];
        if (!cell || cell.availability !== 'WORK') continue;
        const shift = getDraftShift(row.empId, cell.date, cell.effectiveShift);
        if (shift === 'MORNING') morning.push(row.name);
        if (shift === 'EVENING') evening.push(row.name);
        if (shift === 'COVER_RASHID_AM') rashidAm.push(row.name);
        if (shift === 'COVER_RASHID_PM') rashidPm.push(row.name);
      }
      morningByDay.push(morning);
      eveningByDay.push(evening);
      rashidAmByDay.push(rashidAm);
      rashidPmByDay.push(rashidPm);
    }
    return { morningByDay, eveningByDay, rashidAmByDay, rashidPmByDay };
  }, [gridData, getDraftShift]);

  const applyBatch = useCallback(async () => {
    const entries = Array.from(pendingEdits.entries());
    if (entries.length === 0) return;
    setSaving(true);
    setSaveProgress({ done: 0, total: entries.length });
    const reason = globalReason.trim() || DEFAULT_REASON;
    const CONCURRENCY = SAVE_CONCURRENCY;
    let done = 0;
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const chunk = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async ([key, edit]) => {
          const [empId, date] = key.split('|');
          const useReason = edit.reason?.trim() || reason;
          try {
            if (edit.newShift === edit.originalEffectiveShift && edit.overrideId) {
              const res = await fetch(`/api/overrides/${edit.overrideId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false }),
              });
              if (!res.ok) throw new Error('Failed');
            } else if (edit.overrideId) {
              const res = await fetch(`/api/overrides/${edit.overrideId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ overrideShift: edit.newShift, reason: useReason }),
              });
              if (!res.ok) throw new Error('Failed');
            } else {
              const res = await fetch('/api/overrides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  empId,
                  date,
                  overrideShift: edit.newShift,
                  reason: useReason,
                }),
              });
              if (!res.ok) throw new Error('Failed');
            }
          } finally {
            done++;
            setSaveProgress((p) => ({ ...p, done }));
          }
        })
      );
    }
    setPendingEdits(new Map());
    setSaveModalOpen(false);
    setGlobalReason(DEFAULT_REASON);
    setSaving(false);
    fetchGrid();
    setToast((t('schedule.savedChanges') as string)?.replace?.('{n}', String(entries.length)) ?? `Saved ${entries.length} changes`);
    setTimeout(() => setToast(null), 4000);
  }, [pendingEdits, globalReason, fetchGrid, t]);

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
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-full">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('week')}
              className={`rounded px-3 py-2 text-base font-medium ${tab === 'week' ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700'}`}
            >
              {t('schedule.week')}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setTab('month')}
                className={`rounded px-3 py-2 text-base font-medium ${tab === 'month' ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700'}`}
              >
                {t('schedule.month')}
              </button>
            )}
          </div>
          {tab === 'week' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                disabled={gridLoading}
                title={t('schedule.previousWeek')}
                className="rounded border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
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
                className="rounded border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
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
            </div>
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
                className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('schedule.saveChanges') ?? 'Save changes'}
              </button>
              <button
                type="button"
                onClick={discardAll}
                disabled={pendingCount === 0}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('schedule.discardChanges') ?? 'Discard changes'}
              </button>
            </>
          )}
        </div>

        {tab === 'week' && (
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('modern')}
              className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'modern' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Modern
            </button>
            <button
              type="button"
              onClick={() => setViewMode('excel')}
              className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'excel' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Excel
            </button>
          </div>
        )}

        {tab === 'week' && showBanner && (
          <div
            className={`mb-3 flex items-center justify-between rounded-md border px-4 py-2 text-sm ${
              viewMode === 'excel' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-100 text-slate-700'
            }`}
          >
            <div>{viewMode === 'excel' ? t('schedule.view.excelBanner') : t('schedule.view.modernBanner')}</div>
            <button type="button" onClick={() => setShowBanner(false)} className="text-xs opacity-70 hover:opacity-100" aria-label={t('common.close') ?? 'Close'}>
              ✕
            </button>
          </div>
        )}

        {tab === 'week' && gridData && viewMode === 'excel' && excelData && (() => {
          const { visibleSlots, maxPerCell } = getVisibleSlotCount({
            morningByDay: excelData.morningByDay,
            eveningByDay: excelData.eveningByDay,
          });
          return (
            <ScheduleExcelViewClient
              gridData={{ days: gridData.days, counts: draftCounts.length ? draftCounts : gridData.counts }}
              excelData={excelData}
              visibleSlots={visibleSlots}
              maxPerCell={maxPerCell}
              formatDDMM={formatDDMM}
              getDayName={(d: string) => getDayName(d, locale)}
              t={t}
            />
          );
        })()}

        {tab === 'week' && gridData && viewMode === 'modern' && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="overflow-hidden">
                <LuxuryTable>
                  <LuxuryTableHead>
                    <LuxuryTh className="sticky left-0 z-10 min-w-[100px] bg-slate-100">{t('schedule.day')}</LuxuryTh>
                    {gridData.days.map((day) => (
                      <LuxuryTh
                        key={day.date}
                        ref={(el) => {
                          dayRefs.current[day.date] = el;
                        }}
                        className="min-w-[88px] text-center"
                      >
                        <div className="font-medium">{getDayName(day.date, locale)}</div>
                        <div className="text-xs text-slate-500">{formatDDMM(day.date)}</div>
                      </LuxuryTh>
                    ))}
                  </LuxuryTableHead>
                  <LuxuryTableBody>
                    {gridData.rows.map((row) => (
                      <tr key={row.empId}>
                        <LuxuryTd className="sticky left-0 z-10 min-w-[100px] bg-white font-medium" title={row.name}>
                          <span className="whitespace-nowrap">{getFirstName(row.name)}</span>
                        </LuxuryTd>
                        {row.cells.map((cell) => {
                          const locked = cell.availability !== 'WORK';
                          const key = editKey(row.empId, cell.date);
                          const edit = pendingEdits.get(key);
                          const draftShift = edit ? edit.newShift : cell.effectiveShift;
                          const isEdited = !!edit;

                          return (
                            <LuxuryTd
                              key={cell.date}
                              className={`min-w-[88px] p-0 align-middle ${isEdited ? 'ring-1 ring-sky-400 ring-inset' : ''}`}
                            >
                              {locked ? (
                                <div className="flex h-full min-h-[44px] items-center justify-center bg-slate-100 px-2 text-center text-xs text-slate-500">
                                  {cell.availability === 'LEAVE'
                                    ? t('leaves.title')
                                    : cell.availability === 'OFF'
                                      ? t('common.offDay')
                                      : t('inventory.absent')}
                                </div>
                              ) : canEdit ? (
                                <div className="relative flex h-full min-h-[44px] items-center justify-center px-1">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <select
                                      value={draftShift}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'RESET') {
                                          clearPendingEdit(row.empId, cell.date);
                                          return;
                                        }
                                        const shift = val as 'MORNING' | 'EVENING' | 'NONE';
                                        addPendingEdit(row.empId, cell.date, shift, row, cell);
                                      }}
                                      className="w-full min-w-0 max-w-[84px] cursor-pointer rounded border border-slate-300 bg-white py-1.5 pl-2 pr-6 text-center text-sm"
                                    >
                                      <option value="MORNING">{t('schedule.morning')}</option>
                                      <option value="EVENING">{t('schedule.evening')}</option>
                                      <option value="NONE">NONE</option>
                                      {isEdited && (
                                        <option value="RESET">{t('schedule.reset') ?? 'Reset'}</option>
                                      )}
                                    </select>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex h-full min-h-[44px] items-center justify-center px-2 text-sm">
                                  {draftShift === 'MORNING'
                                    ? t('schedule.morning')
                                    : draftShift === 'EVENING'
                                      ? t('schedule.evening')
                                      : '—'}
                                </div>
                              )}
                            </LuxuryTd>
                          );
                        })}
                      </tr>
                    ))}
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

            {canEdit && (
              <div className="w-full shrink-0 lg:w-72">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('coverage.title')}</h3>
                  <p className="mb-3 text-xs text-slate-600">
                    {(t('schedule.daysNeedingAttention') as string)?.replace?.('{n}', String(daysNeedingAttention)) ??
                      `Days needing attention: ${daysNeedingAttention}`}
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
                                    v.type === 'AM_GT_PM' ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-900'
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
              </div>
            )}
          </div>
        )}

        {tab === 'month' && monthData && (
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

        {tab === 'week' && !gridData && (
          <p className="text-slate-600">{typeof t('common.loading') === 'string' ? t('common.loading') : 'Loading…'}</p>
        )}
      </div>

      {saveModalOpen && canEdit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !saving && setSaveModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <h4 className="text-lg font-semibold text-slate-900">
              {(t('schedule.saveConfirmTitle') as string)?.replace?.('{n}', String(pendingCount)) ?? `Apply ${pendingCount} changes?`}
            </h4>
            <p className="mt-2 text-sm text-slate-600">{t('schedule.saveConfirmSubtitle') ?? 'Summary of changes:'}</p>
            <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              {Array.from(pendingEdits.entries()).map(([key, edit]) => {
                const [, date] = key.split('|');
                const from = edit.originalEffectiveShift === 'MORNING' ? 'AM' : edit.originalEffectiveShift === 'EVENING' ? 'PM' : 'NONE';
                const to = edit.newShift === 'MORNING' ? 'AM' : edit.newShift === 'EVENING' ? 'PM' : 'NONE';
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
                placeholder={DEFAULT_REASON}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                disabled={saving}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && setSaveModalOpen(false)}
                disabled={saving}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={applyBatch}
                disabled={saving}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {saving ? `${saveProgress.done} / ${saveProgress.total}…` : (t('schedule.saveChanges') ?? 'Save changes')}
              </button>
            </div>
          </div>
        </>
      )}

      {leaveConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-slate-800">
              {t('schedule.unsavedLeaveMessage') ?? 'You have unsaved changes. Leave anyway?'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeaveConfirm(null)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                {t('schedule.leaveAnyway') ?? 'Leave anyway'}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-800 shadow"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
