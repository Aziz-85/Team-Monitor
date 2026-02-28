'use client';

import { useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { ShiftCard } from '@/components/ui/ShiftCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { useI18n } from '@/app/providers';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { ZonesMapDialog } from '@/components/inventory/ZonesMapDialog';
import { getZoneBadgeClasses } from '@/lib/zones';
import { formatSarFromHalala } from '@/lib/utils/money';

function weekStartFor(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type ValidationResult = {
  type: string;
  severity: string;
  message: string;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
};

type CoverageSuggestion = {
  date: string;
  fromShift: string;
  toShift: string;
  empId: string;
  employeeName: string;
  reason: string;
  impact: { amBefore: number; pmBefore: number; amAfter: number; pmAfter: number };
};

type HomeData = {
  date: string;
  roster: {
    amEmployees: Array<{ empId: string; name: string }>;
    pmEmployees: Array<{ empId: string; name: string }>;
    warnings: string[];
  };
  coverageValidation?: ValidationResult[];
  coverageSuggestion?: CoverageSuggestion | null;
  coverageSuggestionExplanation?: string;
  todayTasks: Array<{
    taskName: string;
    assignedTo: string | null;
    reason: string;
    reasonNotes: string[];
  }>;
};

type MyTodayTask = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  completedAt?: string | null;
  kind: 'task' | 'inventory';
};

type HomePageClientProps = {
  myZone?: { zone: string } | null;
};

export function HomePageClient({ myZone }: HomePageClientProps) {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekSummary, setWeekSummary] = useState<Array<{
    date: string;
    dayName: string;
    messages: string[];
    suggestion?: { empId: string; employeeName: string } | null;
  }>>([]);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [myTodayTasks, setMyTodayTasks] = useState<MyTodayTask[] | null>(null);
  const [myTodayTasksLoading, setMyTodayTasksLoading] = useState(false);
  const [myTodayTasksError, setMyTodayTasksError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [targetsData, setTargetsData] = useState<{
    todayTarget: number;
    todaySales: number;
    todayPct: number;
    monthlyTarget: number;
    mtdSales: number;
    mtdPct: number;
    remaining: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/me/targets')
      .then((r) => r.json())
      .then((d: { todayTarget?: number; todaySales?: number; todayPct?: number; monthlyTarget?: number; mtdSales?: number; mtdPct?: number; remaining?: number }) => {
        if (d && typeof d.todayTarget === 'number') {
          setTargetsData({
            todayTarget: d.todayTarget ?? 0,
            todaySales: d.todaySales ?? 0,
            todayPct: d.todayPct ?? 0,
            monthlyTarget: d.monthlyTarget ?? 0,
            mtdSales: d.mtdSales ?? 0,
            mtdPct: d.mtdPct ?? 0,
            remaining: d.remaining ?? 0,
          });
        }
      })
      .catch(() => setTargetsData(null));
  }, []);

  useEffect(() => {
    setLoadError(null);
    fetch(`/api/home?date=${date}`)
      .then((r) => r.text().then((text) => {
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        return { ok: r.ok, json };
      }))
      .then(({ ok, json }) => {
        const obj = json as { roster?: unknown; error?: string; details?: string } | null;
        if (ok && obj?.roster != null) {
          setData(obj as HomeData);
          setLoadError(null);
        } else {
          setData(null);
          setLoadError(obj?.error || obj?.details || 'Failed to load');
        }
      })
      .catch(() => {
        setData(null);
        setLoadError('Failed to load');
      });
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setMyTodayTasksLoading(true);
    setMyTodayTasksError(null);
    fetch('/api/tasks/my-today')
      .then((r) => r.json().catch(() => null))
      .then((json: { tasks?: MyTodayTask[]; error?: string } | null) => {
        if (cancelled) return;
        if (!json || !Array.isArray(json.tasks)) {
          setMyTodayTasks([]);
          if (json?.error) setMyTodayTasksError(json.error);
          return;
        }
        setMyTodayTasks(json.tasks);
      })
      .catch(() => {
        if (cancelled) return;
        setMyTodayTasks([]);
        setMyTodayTasksError('Failed to load');
      })
      .finally(() => {
        if (cancelled) return;
        setMyTodayTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ws = weekStartFor(date);
    fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((week: {
        days?: Array<{
          date: string;
          coverageValidation?: ValidationResult[];
          coverageSuggestion?: { empId: string; employeeName: string } | null;
        }>;
      } | null) => {
        if (!week?.days) {
          setWeekSummary([]);
          return;
        }
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const list = week.days
          .filter((d) => d.coverageValidation?.length)
          .map((d) => ({
            date: d.date,
            dayName: dayNames[new Date(d.date + 'T12:00:00Z').getUTCDay()],
            messages: (d.coverageValidation ?? []).map((v: ValidationResult) => v.message),
            suggestion: d.coverageSuggestion ?? null,
          }));
        setWeekSummary(list);
      })
      .catch(() => setWeekSummary([]));
  }, [date]);

  if (!data) {
    return (
      <div className="p-4">
        {loadError ? (
          <p className="text-red-600">{loadError}</p>
        ) : (
          <p className="text-slate-600">Loading…</p>
        )}
      </div>
    );
  }

  const roster = data.roster ?? {
    amEmployees: [] as Array<{ empId: string; name: string }>,
    pmEmployees: [] as Array<{ empId: string; name: string }>,
    warnings: [] as string[],
  };
  const coverageValidation: ValidationResult[] = data.coverageValidation ?? [];
  const coverageSuggestion = data.coverageSuggestion ?? null;
  const coverageSuggestionExplanation = data.coverageSuggestionExplanation;
  const todayTasks = data.todayTasks ?? [];

  const applySuggestion = async () => {
    if (!coverageSuggestion || applyingSuggestion) return;
    setApplyingSuggestion(true);
    try {
      const res = await fetch('/api/suggestions/coverage/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: data.date, empId: coverageSuggestion.empId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLoadError(null);
        const homeRes = await fetch(`/api/home?date=${date}`);
        const homeJson = await homeRes.json().catch(() => null);
        if (homeJson?.roster != null) setData(homeJson as HomeData);
        const ws = weekStartFor(date);
        const weekRes = await fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' });
        const weekJson = await weekRes.json().catch(() => null);
        if (weekJson?.days) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          setWeekSummary(
            weekJson.days
              .filter((d: { coverageValidation?: ValidationResult[] }) => d.coverageValidation?.length)
              .map((d: { date: string; coverageValidation: ValidationResult[] }) => ({
                date: d.date,
                dayName: dayNames[new Date(d.date + 'T12:00:00Z').getUTCDay()],
                messages: (d.coverageValidation ?? []).map((v: ValidationResult) => v.message),
              }))
          );
        }
      } else {
        setLoadError(json.error || 'Failed to apply suggestion');
      }
    } finally {
      setApplyingSuggestion(false);
    }
  };

  const myZoneBadgeText = myZone
    ? (t('inventory.myZoneBadge') as string).replace('{zone}', myZone.zone)
    : t('inventory.zoneNotAssignedShort');

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="text-base font-medium text-slate-700">{t('common.date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-base"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                myZone ? getZoneBadgeClasses(myZone.zone) : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {myZoneBadgeText}
            </span>
            {myZone && (
              <button
                type="button"
                onClick={() => setZoneDialogOpen(true)}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                {t('inventory.openMap')}
              </button>
            )}
          </div>
        </div>

        {targetsData != null && (targetsData.monthlyTarget > 0 || targetsData.todaySales > 0 || targetsData.mtdSales > 0) && (
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <OpsCard title={t('home.dailyTargetCard')} className="!p-3">
              <p className="text-sm text-slate-600">
                {t('home.target')}: {formatSarFromHalala(targetsData.todayTarget)} · {t('home.sales')}: {formatSarFromHalala(targetsData.todaySales)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-sky-600"
                  style={{ width: `${Math.min(100, Math.max(0, targetsData.todayPct))}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{targetsData.todayPct.toFixed(1)}%</p>
            </OpsCard>
            <OpsCard title={t('home.monthlyProgressCard')} className="!p-3">
              <p className="text-sm text-slate-600">
                {t('home.target')}: {formatSarFromHalala(targetsData.monthlyTarget)} · MTD: {formatSarFromHalala(targetsData.mtdSales)} · {t('home.remaining')}: {formatSarFromHalala(targetsData.remaining)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(100, Math.max(0, targetsData.mtdPct))}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{targetsData.mtdPct.toFixed(1)}%</p>
            </OpsCard>
          </div>
        )}

        <div className="mb-4">
          <OpsCard title={t('coverage.title')} className="!p-3">
            {coverageValidation.length > 0 ? (
              <ul className="space-y-1 text-base text-amber-800">
                {coverageValidation.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
                <li className="mt-1 font-medium text-slate-700">
                  AM: {roster.amEmployees.length}, PM: {roster.pmEmployees.length}
                </li>
              </ul>
            ) : (
              <p className="text-base font-medium text-slate-600">{t('coverage.noWarnings')}</p>
            )}
          </OpsCard>
        </div>

        {coverageSuggestion && (
          <div className="mb-4">
            <OpsCard title={t('coverage.suggestedFix')} className="!p-3 border-amber-200 bg-amber-50/50">
              <p className="text-base text-amber-900">
                {(t('coverage.moveSuggestion') as string).replace('{name}', coverageSuggestion.employeeName)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {(t('coverage.beforeAfter') as string)
                  .replace('{amBefore}', String(coverageSuggestion.impact.amBefore))
                  .replace('{pmBefore}', String(coverageSuggestion.impact.pmBefore))
                  .replace('{amAfter}', String(coverageSuggestion.impact.amAfter))
                  .replace('{pmAfter}', String(coverageSuggestion.impact.pmAfter))}
              </p>
              <button
                type="button"
                onClick={applySuggestion}
                disabled={applyingSuggestion}
                className="mt-3 rounded bg-amber-600 px-4 py-2 text-base font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {applyingSuggestion ? t('coverage.applying') : t('coverage.applySuggestion')}
              </button>
            </OpsCard>
          </div>
        )}
        {coverageSuggestionExplanation && !coverageSuggestion && coverageValidation.some((v) => v.type === 'AM_GT_PM') && (
          <div className="mb-4">
            <OpsCard title={t('coverage.suggestedFix')} className="!p-3">
              <p className="text-sm text-slate-600">{coverageSuggestionExplanation}</p>
            </OpsCard>
          </div>
        )}

        {weekSummary.length > 0 && (
          <div className="mb-4">
            <OpsCard title={t('coverage.weekSummary')} className="!p-3">
              <ul className="space-y-2 text-base text-amber-800">
                {weekSummary.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-center gap-2">
                    <span>
                      <span className="font-medium">{d.dayName} {d.date.slice(8)}/{d.date.slice(5, 7)}:</span>{' '}
                      {d.messages.join('; ')}
                      {d.suggestion && (
                        <span className="ml-1 text-slate-700">
                          — {(t('coverage.moveSuggestion') as string).replace('{name}', d.suggestion.employeeName)}
                        </span>
                      )}
                    </span>
                    {d.suggestion && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch('/api/suggestions/coverage/apply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ date: d.date, empId: d.suggestion!.empId }),
                          });
                          if (res.ok) {
                            const homeRes = await fetch(`/api/home?date=${date}`);
                            const homeJson = await homeRes.json().catch(() => null);
                            if (homeJson?.roster != null) setData(homeJson as HomeData);
                            const ws = weekStartFor(date);
                            const weekRes = await fetch(`/api/schedule/week?weekStart=${ws}`, { cache: 'no-store' });
                            const weekJson = await weekRes.json().catch(() => null);
                            if (weekJson?.days) {
                              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                              setWeekSummary(
                                weekJson.days
                                  .filter((day: { coverageValidation?: ValidationResult[] }) => day.coverageValidation?.length)
                                  .map((day: { date: string; coverageValidation: ValidationResult[]; coverageSuggestion?: { empId: string; employeeName: string } | null }) => ({
                                    date: day.date,
                                    dayName: dayNames[new Date(day.date + 'T12:00:00Z').getUTCDay()],
                                    messages: (day.coverageValidation ?? []).map((v: ValidationResult) => v.message),
                                    suggestion: day.coverageSuggestion ?? null,
                                  }))
                              );
                            }
                          }
                        }}
                        className="rounded bg-amber-600 px-2 py-1 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        {t('coverage.applySuggestion')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </OpsCard>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ShiftCard variant="morning" title={t('schedule.morning')}>
            <ul className="list-inside list-disc">
              {roster.amEmployees.map((e) => (
                <li key={e.empId}>{e.name}</li>
              ))}
              {roster.amEmployees.length === 0 && (
                <li className="text-slate-500">—</li>
              )}
            </ul>
          </ShiftCard>
          <ShiftCard variant="evening" title={t('schedule.evening')}>
            <ul className="list-inside list-disc">
              {roster.pmEmployees.map((e) => (
                <li key={e.empId}>{e.name}</li>
              ))}
              {roster.pmEmployees.length === 0 && (
                <li className="text-slate-500">—</li>
              )}
            </ul>
          </ShiftCard>
        </div>

        <OpsCard title={t('tasks.today')} className="mt-6">
          <ul className="space-y-2">
            {todayTasks.map((task) => (
              <li key={task.taskName} className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-medium text-slate-900">{task.taskName}</span>
                <span className="text-slate-600">→ {task.assignedTo ?? t('tasks.unassigned')}</span>
                <StatusPill
                  variant={
                    task.reason === 'Primary'
                      ? 'primary'
                      : task.reason === 'Backup1'
                        ? 'backup1'
                        : task.reason === 'Backup2'
                          ? 'backup2'
                          : 'unassigned'
                  }
                >
                  {task.reason === 'Primary'
                    ? t('tasks.primary')
                    : task.reason === 'Backup1'
                      ? t('tasks.backup1')
                      : task.reason === 'Backup2'
                        ? t('tasks.backup2')
                        : t('tasks.unassigned')}
                </StatusPill>
                {task.reasonNotes.length > 0 && (
                  <span className="text-slate-500">({task.reasonNotes.join('; ')})</span>
                )}
              </li>
            ))}
            {todayTasks.length === 0 && (
              <li className="text-slate-500">—</li>
            )}
          </ul>
        </OpsCard>

        <OpsCard title={t('home.todayTasksTitle')} className="mt-6">
          {myTodayTasksLoading && (
            <p className="text-slate-600">{t('common.loading')}</p>
          )}
          {!myTodayTasksLoading && myTodayTasksError && (
            <p className="text-red-600 text-sm">{myTodayTasksError}</p>
          )}
          {!myTodayTasksLoading && myTodayTasks && myTodayTasks.length === 0 && !myTodayTasksError && (
            <p className="text-slate-500">{t('home.noTasksToday')}</p>
          )}
          {!myTodayTasksLoading && myTodayTasks && myTodayTasks.length > 0 && (
            <ul className="mt-2 space-y-2">
              {myTodayTasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 text-base">
                  <span className="font-medium text-slate-900">{task.title}</span>
                  {task.isCompleted && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {t('tasks.done')}
                    </span>
                  )}
                  {task.kind === 'task' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (updatingTaskId) return;
                        const action = task.isCompleted ? 'undo' : 'done';
                        setUpdatingTaskId(task.id);
                        try {
                          const res = await fetch('/api/tasks/completion', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ taskId: task.id, action }),
                          });
                          if (res.ok) {
                            const next = await fetch('/api/tasks/my-today')
                              .then((r) => r.json().catch(() => null))
                              .catch(() => null);
                            if (next && Array.isArray(next.tasks)) {
                              setMyTodayTasks(next.tasks as MyTodayTask[]);
                            }
                          }
                        } finally {
                          setUpdatingTaskId(null);
                        }
                      }}
                      disabled={updatingTaskId === task.id}
                      className={
                        task.isCompleted
                          ? 'rounded border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                          : 'rounded bg-sky-600 px-3 py-1 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50'
                      }
                    >
                      {updatingTaskId === task.id
                        ? t('common.loading')
                        : task.isCompleted
                          ? t('tasks.undo')
                          : t('tasks.markDone')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </OpsCard>

        {zoneDialogOpen && myZone && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50"
              aria-hidden
              onClick={() => setZoneDialogOpen(false)}
            />
            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {t('inventory.zonesMapTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setZoneDialogOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm text-slate-600 hover:bg-slate-100"
                  aria-label={t('common.close') ?? 'Close'}
                >
                  ×
                </button>
              </div>
              <ZonesMapDialog selectedZoneKey={myZone.zone as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
