'use client';

import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import {
  LuxuryTable,
  LuxuryTableHead,
  LuxuryTableBody,
  LuxuryTh,
  LuxuryTd,
} from '@/components/ui/LuxuryTable';
import { formatDateTimeDisplayRiyadh } from '@/lib/time';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';

/** Task Monitor-only grid table for perfect header/body column alignment. NOT used by schedule. */
function TaskMonitorGridTable({
  gridTemplateColumns,
  headers,
  children,
}: {
  gridTemplateColumns: string;
  headers: ReactNode[];
  children: ReactNode;
}) {
  const headerCell = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-foreground bg-surface-subtle border-b border-border';

  return (
    <div
      className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden"
      style={{ display: 'grid', gridTemplateColumns }}
    >
      {headers.map((h, i) => (
        <div key={`h-${i}`} className={headerCell}>
          {h}
        </div>
      ))}
      {children}
    </div>
  );
}

const BODY_CELL = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-sm border-b border-border';

type TaskMonitorRow = {
  taskId: string;
  title: string;
  type: string;
  dueDate: string;
  assignedTo: string | null;
  assignedToAr?: string | null;
  assignedEmpId: string | null;
  status: 'done' | 'pending';
  completedAt: string | null;
  overdue: boolean;
  isValidCompletion: boolean;
  isSuspiciousBurst: boolean;
  completionDelay?: { kind: 'early' | 'onTime' | 'late'; text: string; minutes?: number };
  overdueByDays?: number;
};

type EmployeeStatRow = {
  empId: string;
  name: string;
  nameAr?: string | null;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number | null;
  avgDelayMinutes: number | null;
};

type SuspiciousBurstRow = {
  empId: string;
  empName: string;
  empNameAr?: string | null;
  burstCount: number;
  biggestBurstSize: number;
  burstStart: string;
  burstEnd: string;
  tasks: { title: string; completedAt: string }[];
};

type MonitorData = {
  dateStr: string;
  launchDate: string;
  employees: { empId: string; name: string; nameAr?: string | null }[];
  summary: { completed: number; pending: number; overdue: number; suspicious: number };
  completedTasks: TaskMonitorRow[];
  pendingTasks: TaskMonitorRow[];
  employeeStats: EmployeeStatRow[];
  suspiciousBursts: SuspiciousBurstRow[];
};

type DateRange = 'today' | 'week' | 'month' | 'custom';

export function TasksMonitorClient() {
  const { t: tBase, locale } = useT();
  const t = (key: string) => tBase(`tasks.${key}`) || tBase(key);

  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    dateRange: 'week' as DateRange,
    customStart: '',
    customEnd: '',
    status: 'all',
    assignee: 'all',
    type: 'all',
    search: '',
    onlySuspicious: false,
    startPeriodKey: '',
  });

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('dateRange', filters.dateRange);
    if (filters.dateRange === 'custom') {
      if (filters.customStart) p.set('start', filters.customStart);
      if (filters.customEnd) p.set('end', filters.customEnd);
    }
    if (filters.status !== 'all') p.set('status', filters.status);
    if (filters.assignee !== 'all') p.set('assignee', filters.assignee);
    if (filters.type !== 'all') p.set('type', filters.type);
    if (filters.search.trim()) p.set('search', filters.search.trim());
    if (filters.onlySuspicious) p.set('onlySuspicious', '1');
    if (filters.startPeriodKey.trim()) p.set('startPeriodKey', filters.startPeriodKey.trim());
    return p.toString();
  }, [filters]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/tasks/monitor?${buildQuery()}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) return res.json().then((e) => Promise.reject(new Error(e?.error || res.statusText)));
        return res.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (iso: string) => {
    try {
      return formatDateTimeDisplayRiyadh(iso);
    } catch {
      return iso;
    }
  };

  const completionRate = data && data.summary.completed + data.summary.pending > 0
    ? Math.round((data.summary.completed / (data.summary.completed + data.summary.pending)) * 100)
    : 0;
  const isArabic = locale === 'ar';

  if (error) {
    return (
      <div className="p-4">
        <OpsCard title={t('monitorTitle')}>
          <p className="text-red-600">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 rounded bg-accent px-3 py-1.5 text-sm text-white"
          >
            Retry
          </button>
        </OpsCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold text-foreground">{t('monitorTitle')}</h1>

      {/* Filters */}
      <OpsCard title={t('filters')} className="rounded-2xl border border-border shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t('dateRange')}</label>
            <select
              value={filters.dateRange}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateRange: e.target.value as DateRange }))
              }
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            >
              <option value="today">{t('today')}</option>
              <option value="week">{t('thisWeek')}</option>
              <option value="month">{t('thisMonth')}</option>
              <option value="custom">{t('customRange')}</option>
            </select>
          </div>
          {filters.dateRange === 'custom' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Start</label>
                <input
                  type="date"
                  value={filters.customStart}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customStart: e.target.value }))}
                  className="w-full rounded border border-border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">End</label>
                <input
                  type="date"
                  value={filters.customEnd}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customEnd: e.target.value }))}
                  className="w-full rounded border border-border px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t('status')}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              <option value="completed">{t('completed')}</option>
              <option value="pending">{t('pending')}</option>
              <option value="overdue">{t('overdue')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t('assignee')}</label>
            <select
              value={filters.assignee}
              onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))}
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              {data?.employees?.map((emp) => (
                <option key={emp.empId} value={emp.empId}>
                  {getEmployeeDisplayName(emp, locale)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t('type')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              <option value="DAILY">DAILY</option>
              <option value="WEEKLY">WEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted">{t('search')}</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder={t('search')}
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.onlySuspicious}
                onChange={(e) => setFilters((prev) => ({ ...prev, onlySuspicious: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-sm">{t('onlySuspicious')}</span>
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t('startPeriod')}</label>
            <input
              type="text"
              value={filters.startPeriodKey}
              onChange={(e) => setFilters((prev) => ({ ...prev, startPeriodKey: e.target.value }))}
              placeholder={t('startPeriodPlaceholder')}
              className="w-full rounded border border-border px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {loading ? '...' : t('search')}
          </button>
        </div>
      </OpsCard>

      {loading && !data && (
        <div className="py-8 text-center text-muted">Loading...</div>
      )}

      {data && (
        <>
          <section className="overflow-hidden rounded-[28px] border border-violet-200/70 bg-[linear-gradient(125deg,rgba(255,255,255,.98),rgba(245,243,255,.94),rgba(236,253,245,.72))] p-5 shadow-[0_20px_55px_-38px_rgba(79,70,229,.55)] md:p-6">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <span className="inline-flex rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-violet-700">{isArabic ? 'نبض أداء الفريق' : 'Performance pulse'}</span>
                <h2 className="mt-3 text-2xl font-bold text-foreground">{completionRate >= 80 ? (isArabic ? 'زخم ممتاز للفريق' : 'Excellent team momentum') : completionRate >= 50 ? (isArabic ? 'التقدم يتصاعد' : 'Progress is building') : (isArabic ? 'ركزوا على الإنجاز الواضح التالي' : 'Focus on the next clear win')}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{isArabic ? 'نحتفي بالمنجز، ونوضح المتأخر، ولا يدخل في تقييم الموظف إلا النشاط من تاريخ الإطلاق الرسمي.' : 'Completed work is celebrated, overdue work is visible, and only activity from the official launch date affects employee performance.'}</p>
                <p className="mt-3 text-xs font-semibold text-violet-700">{isArabic ? `يبدأ التقييم العادل من ${data.launchDate} · المهام السابقة مستبعدة` : `Fair scoring starts ${data.launchDate} · Earlier tasks are excluded`}</p>
              </div>
              <div className="min-w-[190px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                <div className="flex items-end justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted">{isArabic ? 'الإنجاز' : 'Completion'}</span><strong className="text-3xl text-emerald-700">{completionRate}%</strong></div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all" style={{ width: `${completionRate}%` }} /></div>
                <p className="mt-2 text-xs text-muted">{isArabic ? `${data.summary.completed} منجزة من ${data.summary.completed + data.summary.pending}` : `${data.summary.completed} completed of ${data.summary.completed + data.summary.pending}`}</p>
              </div>
            </div>
          </section>

          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OpsCard className="rounded-2xl border border-emerald-200 bg-emerald-50/50">
              <p className="text-xs font-medium uppercase text-muted">{t('summaryCompleted')}</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.completed}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-amber-200 bg-amber-50/50">
              <p className="text-xs font-medium uppercase text-muted">{t('summaryPending')}</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.pending}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-red-200 bg-red-50/50">
              <p className="text-xs font-medium uppercase text-muted">{t('summaryOverdue')}</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.overdue}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-violet-200 bg-violet-50/50">
              <p className="text-xs font-medium uppercase text-muted">{t('summarySuspicious')}</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.suspicious}</p>
            </OpsCard>
          </div>

          {/* Completed tasks */}
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t('completedTableTitle')}</h2>
            <TaskMonitorGridTable
              gridTemplateColumns="2.5fr 1fr 1fr 2fr 2fr 1fr"
              headers={[
                t('colTaskTitle'),
                t('type'),
                t('due'),
                t('assignedTo'),
                t('completedAt'),
                t('delay'),
              ]}
            >
              {data.completedTasks.length === 0 ? (
                <div className="col-span-full px-3 py-2.5 text-center text-muted">—</div>
              ) : (
                data.completedTasks.map((row) => (
                  <React.Fragment key={`${row.taskId}-${row.dueDate}-${row.assignedEmpId ?? 'u'}`}>
                    <div className={BODY_CELL}>{row.title}</div>
                    <div className={BODY_CELL}>{row.type}</div>
                    <div className={BODY_CELL}>{row.dueDate}</div>
                    <div className={BODY_CELL}>
                      {row.assignedTo ? getEmployeeDisplayName({ name: row.assignedTo, nameAr: row.assignedToAr ?? null }, locale) : '—'}
                    </div>
                    <div className={BODY_CELL}>{row.completedAt ? formatDate(row.completedAt) : '—'}</div>
                    <div className={BODY_CELL}>
                      {row.completionDelay ? (
                        <span
                          className={
                            row.completionDelay.kind === 'late'
                              ? 'text-red-600'
                              : row.completionDelay.kind === 'early'
                                ? 'text-emerald-600'
                                : 'text-muted'
                          }
                        >
                          {row.completionDelay.text}
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                  </React.Fragment>
                ))
              )}
            </TaskMonitorGridTable>
          </section>

          {/* Pending / Overdue tasks */}
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t('pendingTableTitle')}</h2>
            <TaskMonitorGridTable
              gridTemplateColumns="2.5fr 1fr 1fr 2fr 1.5fr"
              headers={[
                t('colTaskTitle'),
                t('type'),
                t('due'),
                t('assignedTo'),
                t('status'),
              ]}
            >
              {data.pendingTasks.length === 0 ? (
                <div className="col-span-full px-3 py-2.5 text-center text-muted">—</div>
              ) : (
                data.pendingTasks.map((row) => (
                  <React.Fragment key={`${row.taskId}-${row.dueDate}-${row.assignedEmpId ?? 'u'}`}>
                    <div className={BODY_CELL}>{row.title}</div>
                    <div className={BODY_CELL}>{row.type}</div>
                    <div className={BODY_CELL}>{row.dueDate}</div>
                    <div className={BODY_CELL}>
                      {row.assignedTo ? getEmployeeDisplayName({ name: row.assignedTo, nameAr: row.assignedToAr ?? null }, locale) : '—'}
                    </div>
                    <div className={BODY_CELL}>
                      {row.isSuspiciousBurst ? (
                        <span className="text-violet-600">{t('summarySuspicious')}</span>
                      ) : row.overdue ? (
                        <span className="text-red-600">
                          {t('overdue')}
                          {row.overdueByDays != null ? ` (${row.overdueByDays}d)` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-600">{t('pending')}</span>
                      )}
                    </div>
                  </React.Fragment>
                ))
              )}
            </TaskMonitorGridTable>
          </section>

          {/* Employee performance */}
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t('employeePerformanceTitle')}</h2>
            <LuxuryTable noScroll>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <LuxuryTableHead>
                  <LuxuryTh>{t('assignedTo')}</LuxuryTh>
                  <LuxuryTh>{t('assignedCount')}</LuxuryTh>
                  <LuxuryTh>{t('completedCount')}</LuxuryTh>
                  <LuxuryTh>{t('pendingCount')}</LuxuryTh>
                  <LuxuryTh>{t('overdueCount')}</LuxuryTh>
                  <LuxuryTh>{t('completionRate')}</LuxuryTh>
                  <LuxuryTh>{t('onTimeRate')}</LuxuryTh>
                  <LuxuryTh>{t('avgDelay')}</LuxuryTh>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {data.employeeStats.length === 0 ? (
                  <tr>
                    <LuxuryTd colSpan={8} className="text-center text-muted">
                      —
                    </LuxuryTd>
                  </tr>
                ) : (
                  data.employeeStats.map((row) => (
                    <tr key={row.empId}>
                      <LuxuryTd className="truncate">{getEmployeeDisplayName(row, locale)}</LuxuryTd>
                      <LuxuryTd>{row.assigned}</LuxuryTd>
                      <LuxuryTd>{row.completed}</LuxuryTd>
                      <LuxuryTd>{row.pending}</LuxuryTd>
                      <LuxuryTd>{row.overdue}</LuxuryTd>
                      <LuxuryTd>{row.completionRate}%</LuxuryTd>
                      <LuxuryTd>{row.onTimeRate == null ? '—' : `${row.onTimeRate}%`}</LuxuryTd>
                      <LuxuryTd>
                        {row.avgDelayMinutes != null && row.avgDelayMinutes !== 0
                          ? `${row.avgDelayMinutes}m`
                          : '—'}
                      </LuxuryTd>
                    </tr>
                  ))
                )}
              </LuxuryTableBody>
            </LuxuryTable>
          </section>

          {/* Suspicious activity */}
          {data.suspiciousBursts.length > 0 && (
            <OpsCard title={t('suspiciousTitle')} className="rounded-2xl border border-violet-200 shadow-sm">
              <p className="mb-3 text-sm text-muted">{t('suspiciousHint')}</p>
              <div className="space-y-4">
                {data.suspiciousBursts.map((burst) => (
                  <div
                    key={burst.empId}
                    className="rounded-xl border border-violet-200 bg-violet-50/50 p-3"
                  >
                    <p className="font-medium text-foreground">{getEmployeeDisplayName({ name: burst.empName, nameAr: burst.empNameAr ?? null }, locale)}</p>
                    <p className="text-xs text-muted">
                      {t('burstSize')}: {burst.biggestBurstSize} · {t('burstWindow')}: {burst.burstCount}
                    </p>
                    <p className="text-xs text-muted">
                      {t('burstRange')}: {formatDate(burst.burstStart)} → {formatDate(burst.burstEnd)}
                    </p>
                    {burst.tasks?.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sm text-foreground">
                        {burst.tasks.slice(0, 8).map((t, i) => (
                          <li key={i}>
                            {t.title} — {formatDate(t.completedAt)}
                          </li>
                        ))}
                        {burst.tasks.length > 8 && (
                          <li className="text-muted">+{burst.tasks.length - 8} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </OpsCard>
          )}
        </>
      )}
    </div>
  );
}
