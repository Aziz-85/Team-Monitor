'use client';

import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { useT } from '@/lib/i18n/useT';
import { getWeekStartSaturday } from '@/lib/utils/week';
import { ZonesMapDialog } from '@/components/inventory/ZonesMapDialog';
import { getZoneBadgeClasses } from '@/lib/zones';
import { LuxuryPerformanceCard } from '@/components/dashboard/LuxuryPerformanceCard';
import { LuxuryPaceCard } from '@/components/dashboard/LuxuryPaceCard';
import { LuxuryTopSellerCard } from '@/components/dashboard/LuxuryTopSellerCard';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { formatSarInt } from '@/lib/utils/money';
import { CoverageStatusCard } from '@/components/dashboard/home/CoverageStatusCard';
import { ShiftSnapshotCard } from '@/components/dashboard/home/ShiftSnapshotCard';
import { KeyHolderCard } from '@/components/dashboard/home/KeyHolderCard';
import { TasksTodayCard } from '@/components/dashboard/home/TasksTodayCard';
import { OperationalAlertsCard } from '@/components/dashboard/home/OperationalAlertsCard';
import { CardShell } from '@/components/dashboard/cards/CardShell';
import { ChartCard } from '@/components/ui/ChartCard';

function weekStartFor(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

type PerformanceSummary = {
  daily: { target: number; sales: number; remaining: number; percent: number };
  weekly: { target: number; sales: number; remaining: number; percent: number };
  monthly: { target: number; sales: number; remaining: number; percent: number };
  dailyTrajectory?: { dateKey: string; targetCumulative: number; actualCumulative: number }[];
  topSellers?: {
    today: Array<{ employeeId: string; employeeName: string; amount: number; rank: number }>;
    week: Array<{ employeeId: string; employeeName: string; amount: number; rank: number }>;
    month: Array<{ employeeId: string; employeeName: string; amount: number; rank: number }>;
  };
  daysInMonth?: number;
  todayDayOfMonth?: number;
};

type HomePageClientProps = {
  myZone?: { zone: string } | null;
};

export function HomePageClient({ myZone }: HomePageClientProps) {
  const { t } = useT();
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
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);

  useEffect(() => {
    fetch('/api/performance/summary')
      .then((r) => r.json())
      .then((d: PerformanceSummary) => {
        if (d?.daily != null) setPerformance(d);
      })
      .catch(() => setPerformance(null));
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
    return () => { cancelled = true; };
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
          <p className="text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const isSelectedToday = date === todayStr;

  const roster = data.roster ?? {
    amEmployees: [] as Array<{ empId: string; name: string }>,
    pmEmployees: [] as Array<{ empId: string; name: string }>,
    warnings: [] as string[],
  };
  const coverageValidation: ValidationResult[] = data.coverageValidation ?? [];
  const coverageSuggestion = data.coverageSuggestion ?? null;
  const coverageSuggestionExplanation = data.coverageSuggestionExplanation;
  const todayTasks = data.todayTasks ?? [];

  const expectedPct =
    performance && performance.daysInMonth && performance.todayDayOfMonth && performance.daysInMonth > 0
      ? Math.floor((performance.todayDayOfMonth / performance.daysInMonth) * 100)
      : 0;

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

  const trajectory = performance?.dailyTrajectory ?? [];
  const chartData = trajectory.map((d) => ({
    label: d.dateKey.slice(-2),
    value: d.actualCumulative,
  }));
  const targetLine = trajectory.map((d) => d.targetCumulative);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--app-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-muted">{t('common.date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm"
              />
            </div>
            <p className="text-xs text-muted">{t('home.dateContextHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                myZone ? getZoneBadgeClasses(myZone.zone) : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {myZoneBadgeText}
            </span>
            {myZone && (
              <button
                type="button"
                onClick={() => setZoneDialogOpen(true)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-surface-subtle"
              >
                {t('inventory.openMap')}
              </button>
            )}
          </div>
        </div>

        {/* Performance section (always today) */}
        {performance && (
          <section className="mb-10 rounded-2xl border border-border/60 bg-surface/50 p-6 md:p-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              {t('home.performanceTodayOnly')}
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <LuxuryPerformanceCard
                title="Today"
                target={performance.daily.target}
                sales={performance.daily.sales}
                remaining={performance.daily.remaining}
                percent={performance.daily.percent}
              />
              <LuxuryPerformanceCard
                title="This Week"
                target={performance.weekly.target}
                sales={performance.weekly.sales}
                remaining={performance.weekly.remaining}
                percent={performance.weekly.percent}
                sparklineValues={
                  trajectory.length >= 2
                    ? trajectory.slice(0, Math.min(7, trajectory.length)).map((d) => d.actualCumulative)
                    : undefined
                }
              />
              <LuxuryPerformanceCard
                title="This Month"
                target={performance.monthly.target}
                sales={performance.monthly.sales}
                remaining={performance.monthly.remaining}
                percent={performance.monthly.percent}
                sparklineValues={trajectory.map((d) => d.actualCumulative)}
              />
            </div>
            <div className="mt-10">
              <LuxuryPaceCard
              expectedPct={expectedPct}
              actualPct={performance.daily.percent}
            />
            </div>
            <div className="mt-10">
              <ChartCard
                title="Target vs Actual (MTD)"
                subtitle="Cumulative sales vs target by day"
                className="md:p-8 [&>div:first-child]:mb-6"
              >
                <PerformanceLineChart
                  data={chartData}
                  targetLine={targetLine}
                  height={260}
                  valueFormat={(n) => formatSarInt(n)}
                  emptyLabel="No sales data yet"
                />
              </ChartCard>
            </div>
            {performance.topSellers && (
            <>
            <h2 className="mt-10 mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              Top Sellers
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LuxuryTopSellerCard
                title="Top Seller Today"
                entries={performance.topSellers.today ?? []}
                emptyLabel="No sales yet today"
              />
              <LuxuryTopSellerCard
                title="Top Seller Week"
                entries={performance.topSellers.week ?? []}
                emptyLabel="No sales yet this week"
              />
              <LuxuryTopSellerCard
                title="Top Seller Month"
                entries={performance.topSellers.month ?? []}
                emptyLabel="No sales yet this month"
              />
            </div>
            </>
            )}
          </section>
        )}

        {/* Operational section (selected date) */}
        <div className="space-y-6">
          {/* ROW 1: Coverage Status | Shift Snapshot */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CoverageStatusCard
              selectedDayMessage={coverageValidation.length > 0 ? coverageValidation[0].message : null}
              weekWarningCount={weekSummary.length}
              suggestedAction={
                coverageSuggestion
                  ? {
                      employeeName: coverageSuggestion.employeeName,
                      impact: coverageSuggestion.impact,
                    }
                  : null
              }
              onApplySuggestion={applySuggestion}
              applying={applyingSuggestion}
              applyLabel={t('coverage.applySuggestion')}
              beforeAfterLabel={t('coverage.beforeAfter') as string}
              moveSuggestionLabel={t('coverage.moveSuggestion') as string}
              titleLabel={t('home.coverageStatus')}
              selectedDayLabel={t('home.selectedDay')}
              selectedDateNoIssueLabel={t('coverage.selectedDateNoIssue')}
              selectedDateAllClearLabel={t('coverage.selectedDateAllClear')}
              thisWeekLabel={t('coverage.thisWeekLabel')}
              thisWeekDaysNeedAttentionLabel={t('coverage.thisWeekDaysNeedAttention') as string}
              thisWeekNoWarningsLabel={t('coverage.thisWeekNoWarnings')}
              suggestedActionLabel={t('coverage.suggestedActionLabel')}
            />
            <ShiftSnapshotCard
              morningLabel={t('schedule.morning')}
              eveningLabel={t('schedule.evening')}
              amEmployees={roster.amEmployees}
              pmEmployees={roster.pmEmployees}
            />
          </div>

          {/* ROW 2: Key Holder | Tasks Today */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <KeyHolderCard
              title={isSelectedToday ? t('home.keyHolderToday') : t('home.keyHolder')}
              subtitle={!isSelectedToday ? (t('home.keyHolderForDate') as string).replace('{date}', date) : null}
              primaryLabel={t('tasks.primary')}
              backupLabel={t('tasks.backup1')}
              unassignedLabel={t('tasks.unassigned')}
              tasks={todayTasks}
            />
            <TasksTodayCard
              title={t('home.todayTasksTitle')}
              total={myTodayTasks?.length ?? 0}
              completed={myTodayTasks?.filter((t) => t.isCompleted).length ?? 0}
              pending={myTodayTasks ? myTodayTasks.length - myTodayTasks.filter((t) => t.isCompleted).length : 0}
              loading={myTodayTasksLoading}
              error={myTodayTasksError}
              emptyLabel={t('home.noTasksToday')}
              doneLabel={t('tasks.done')}
            >
              {myTodayTasks?.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{task.title}</span>
                  {task.isCompleted && (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
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
                          ? 'rounded-lg border border-border bg-surface px-3 py-1 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50'
                          : 'rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50'
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
            </TasksTodayCard>
          </div>

          {/* ROW 3: Operational Alerts + Today Tasks (assigned) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <OperationalAlertsCard
              title={t('home.operationalAlerts')}
              allClearLabel={t('home.allClear')}
              alerts={[
                ...coverageValidation.map((v, i) => ({
                  key: `cov-${i}`,
                  label: 'Coverage',
                  value: v.message,
                  severity: 'warn' as const,
                })),
                ...weekSummary.map((d) => ({
                  key: `week-${d.date}`,
                  label: `${d.dayName} ${d.date.slice(8)}`,
                  value: d.messages.join('; '),
                  severity: 'warn' as const,
                })),
                ...(coverageSuggestionExplanation && !coverageSuggestion && coverageValidation.some((v) => v.type === 'AM_GT_PM')
                  ? [{ key: 'explain', label: 'Note', value: String(coverageSuggestionExplanation), severity: 'info' as const }]
                  : []),
              ]}
            />
            <CardShell variant="home">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {isSelectedToday ? t('tasks.today') : (t('home.tasksForDate') as string).replace('{date}', date)}
              </h3>
              <ul className="space-y-2">
                {todayTasks.map((task) => (
                  <li key={task.taskName} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{task.taskName}</span>
                    <span className="text-muted">→ {task.assignedTo ?? t('tasks.unassigned')}</span>
                    <StatusPill
                      variant={
                        task.reason === 'Primary' ? 'primary'
                          : task.reason === 'Backup1' ? 'backup1'
                          : task.reason === 'Backup2' ? 'backup2'
                          : 'unassigned'
                      }
                    >
                      {task.reason === 'Primary' ? t('tasks.primary')
                        : task.reason === 'Backup1' ? t('tasks.backup1')
                        : task.reason === 'Backup2' ? t('tasks.backup2')
                        : t('tasks.unassigned')}
                    </StatusPill>
                    {task.reasonNotes.length > 0 && (
                      <span className="text-muted">({task.reasonNotes.join('; ')})</span>
                    )}
                  </li>
                ))}
                {todayTasks.length === 0 && <li className="text-muted">—</li>}
              </ul>
            </CardShell>
          </div>

          {/* Week summary apply buttons */}
          {weekSummary.length > 0 && (
            <CardShell variant="home">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {t('coverage.weekSummary')}
              </h3>
              <ul className="space-y-2">
                {weekSummary.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      <span className="font-medium">{d.dayName} {d.date.slice(8)}/{d.date.slice(5, 7)}:</span>{' '}
                      {d.messages.join('; ')}
                      {d.suggestion && (
                        <span className="ms-1 text-foreground">
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
                        className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
                      >
                        {t('coverage.applySuggestion')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </CardShell>
          )}
        </div>

        {zoneDialogOpen && myZone && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50"
              aria-hidden
              onClick={() => setZoneDialogOpen(false)}
            />
            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {t('inventory.zonesMapTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setZoneDialogOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-sm text-muted hover:bg-surface-subtle"
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
