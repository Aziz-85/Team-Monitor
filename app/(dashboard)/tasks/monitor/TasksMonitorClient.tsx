'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import {
  LuxuryTable,
  LuxuryTableHead,
  LuxuryTableBody,
  LuxuryTh,
  LuxuryTd,
} from '@/components/ui/LuxuryTable';
import { formatDateTimeDisplayRiyadh } from '@/lib/time';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type TaskMonitorRow = {
  taskId: string;
  title: string;
  type: string;
  dueDate: string;
  assignedTo: string | null;
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
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number;
  avgDelayMinutes: number | null;
};

type SuspiciousBurstRow = {
  empId: string;
  empName: string;
  burstCount: number;
  biggestBurstSize: number;
  burstStart: string;
  burstEnd: string;
  tasks: { title: string; completedAt: string }[];
};

type MonitorData = {
  dateStr: string;
  employees: { empId: string; name: string }[];
  summary: { completed: number; pending: number; overdue: number; suspicious: number };
  completedTasks: TaskMonitorRow[];
  pendingTasks: TaskMonitorRow[];
  employeeStats: EmployeeStatRow[];
  suspiciousBursts: SuspiciousBurstRow[];
};

type DateRange = 'today' | 'week' | 'month' | 'custom';

export function TasksMonitorClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, `tasks.${key}`) as string) || getNested(messages, key) as string || key;

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

  if (error) {
    return (
      <div className="p-4">
        <OpsCard title={t('monitorTitle')}>
          <p className="text-red-600">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
          >
            Retry
          </button>
        </OpsCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold text-slate-900">{t('monitorTitle')}</h1>

      {/* Filters */}
      <OpsCard title={t('filters')} className="rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('dateRange')}</label>
            <select
              value={filters.dateRange}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateRange: e.target.value as DateRange }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                <label className="mb-1 block text-xs font-medium text-slate-600">Start</label>
                <input
                  type="date"
                  value={filters.customStart}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customStart: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">End</label>
                <input
                  type="date"
                  value={filters.customEnd}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customEnd: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('status')}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              <option value="completed">{t('completed')}</option>
              <option value="pending">{t('pending')}</option>
              <option value="overdue">{t('overdue')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('assignee')}</label>
            <select
              value={filters.assignee}
              onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              {data?.employees?.map((emp) => (
                <option key={emp.empId} value={emp.empId}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('type')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">{t('all')}</option>
              <option value="DAILY">DAILY</option>
              <option value="WEEKLY">WEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('search')}</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder={t('search')}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.onlySuspicious}
                onChange={(e) => setFilters((prev) => ({ ...prev, onlySuspicious: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <span className="text-sm">{t('onlySuspicious')}</span>
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('startPeriod')}</label>
            <input
              type="text"
              value={filters.startPeriodKey}
              onChange={(e) => setFilters((prev) => ({ ...prev, startPeriodKey: e.target.value }))}
              placeholder={t('startPeriodPlaceholder')}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {loading ? '...' : t('search')}
          </button>
        </div>
      </OpsCard>

      {loading && !data && (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OpsCard className="rounded-2xl border border-emerald-200 bg-emerald-50/50">
              <p className="text-xs font-medium uppercase text-slate-500">{t('summaryCompleted')}</p>
              <p className="text-2xl font-bold text-slate-900">{data.summary.completed}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-amber-200 bg-amber-50/50">
              <p className="text-xs font-medium uppercase text-slate-500">{t('summaryPending')}</p>
              <p className="text-2xl font-bold text-slate-900">{data.summary.pending}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-red-200 bg-red-50/50">
              <p className="text-xs font-medium uppercase text-slate-500">{t('summaryOverdue')}</p>
              <p className="text-2xl font-bold text-slate-900">{data.summary.overdue}</p>
            </OpsCard>
            <OpsCard className="rounded-2xl border border-violet-200 bg-violet-50/50">
              <p className="text-xs font-medium uppercase text-slate-500">{t('summarySuspicious')}</p>
              <p className="text-2xl font-bold text-slate-900">{data.summary.suspicious}</p>
            </OpsCard>
          </div>

          {/* Completed tasks */}
          <OpsCard title={t('completedTableTitle')} className="rounded-2xl border border-slate-200 shadow-sm">
            <LuxuryTable>
              <LuxuryTableHead>
                <tr>
                  <LuxuryTh>{t('title') || 'Title'}</LuxuryTh>
                  <LuxuryTh>{t('type')}</LuxuryTh>
                  <LuxuryTh>{t('due')}</LuxuryTh>
                  <LuxuryTh>{t('assignedTo')}</LuxuryTh>
                  <LuxuryTh>{t('completedAt')}</LuxuryTh>
                  <LuxuryTh>{t('delay')}</LuxuryTh>
                </tr>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {data.completedTasks.length === 0 ? (
                  <tr>
                    <LuxuryTd colSpan={6} className="text-center text-slate-500">
                      —
                    </LuxuryTd>
                  </tr>
                ) : (
                  data.completedTasks.map((row) => (
                    <tr key={`${row.taskId}-${row.dueDate}-${row.assignedEmpId ?? 'u'}`}>
                      <LuxuryTd>{row.title}</LuxuryTd>
                      <LuxuryTd>{row.type}</LuxuryTd>
                      <LuxuryTd>{row.dueDate}</LuxuryTd>
                      <LuxuryTd>{row.assignedTo ?? '—'}</LuxuryTd>
                      <LuxuryTd>{row.completedAt ? formatDate(row.completedAt) : '—'}</LuxuryTd>
                      <LuxuryTd>
                        {row.completionDelay ? (
                          <span
                            className={
                              row.completionDelay.kind === 'late'
                                ? 'text-red-600'
                                : row.completionDelay.kind === 'early'
                                  ? 'text-emerald-600'
                                  : 'text-slate-600'
                            }
                          >
                            {row.completionDelay.text}
                          </span>
                        ) : (
                          '—'
                        )}
                      </LuxuryTd>
                    </tr>
                  ))
                )}
              </LuxuryTableBody>
            </LuxuryTable>
          </OpsCard>

          {/* Pending / Overdue tasks */}
          <OpsCard title={t('pendingTableTitle')} className="rounded-2xl border border-slate-200 shadow-sm">
            <LuxuryTable>
              <LuxuryTableHead>
                <tr>
                  <LuxuryTh>{t('title') || 'Title'}</LuxuryTh>
                  <LuxuryTh>{t('type')}</LuxuryTh>
                  <LuxuryTh>{t('due')}</LuxuryTh>
                  <LuxuryTh>{t('assignedTo')}</LuxuryTh>
                  <LuxuryTh>{t('status')}</LuxuryTh>
                </tr>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {data.pendingTasks.length === 0 ? (
                  <tr>
                    <LuxuryTd colSpan={5} className="text-center text-slate-500">
                      —
                    </LuxuryTd>
                  </tr>
                ) : (
                  data.pendingTasks.map((row) => (
                    <tr key={`${row.taskId}-${row.dueDate}-${row.assignedEmpId ?? 'u'}`}>
                      <LuxuryTd>{row.title}</LuxuryTd>
                      <LuxuryTd>{row.type}</LuxuryTd>
                      <LuxuryTd>{row.dueDate}</LuxuryTd>
                      <LuxuryTd>{row.assignedTo ?? '—'}</LuxuryTd>
                      <LuxuryTd>
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
                      </LuxuryTd>
                    </tr>
                  ))
                )}
              </LuxuryTableBody>
            </LuxuryTable>
          </OpsCard>

          {/* Employee performance */}
          <OpsCard title={t('employeePerformanceTitle')} className="rounded-2xl border border-slate-200 shadow-sm">
            <LuxuryTable>
              <LuxuryTableHead>
                <tr>
                  <LuxuryTh>{t('assignedTo')}</LuxuryTh>
                  <LuxuryTh>{t('assignedCount')}</LuxuryTh>
                  <LuxuryTh>{t('completedCount')}</LuxuryTh>
                  <LuxuryTh>{t('pendingCount')}</LuxuryTh>
                  <LuxuryTh>{t('overdueCount')}</LuxuryTh>
                  <LuxuryTh>{t('completionRate')}</LuxuryTh>
                  <LuxuryTh>{t('onTimeRate')}</LuxuryTh>
                  <LuxuryTh>{t('avgDelay')}</LuxuryTh>
                </tr>
              </LuxuryTableHead>
              <LuxuryTableBody>
                {data.employeeStats.length === 0 ? (
                  <tr>
                    <LuxuryTd colSpan={8} className="text-center text-slate-500">
                      —
                    </LuxuryTd>
                  </tr>
                ) : (
                  data.employeeStats.map((row) => (
                    <tr key={row.empId}>
                      <LuxuryTd>{row.name}</LuxuryTd>
                      <LuxuryTd>{row.assigned}</LuxuryTd>
                      <LuxuryTd>{row.completed}</LuxuryTd>
                      <LuxuryTd>{row.pending}</LuxuryTd>
                      <LuxuryTd>{row.overdue}</LuxuryTd>
                      <LuxuryTd>{row.completionRate}%</LuxuryTd>
                      <LuxuryTd>{row.onTimeRate}%</LuxuryTd>
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
          </OpsCard>

          {/* Suspicious activity */}
          {data.suspiciousBursts.length > 0 && (
            <OpsCard title={t('suspiciousTitle')} className="rounded-2xl border border-violet-200 shadow-sm">
              <p className="mb-3 text-sm text-slate-600">{t('suspiciousHint')}</p>
              <div className="space-y-4">
                {data.suspiciousBursts.map((burst) => (
                  <div
                    key={burst.empId}
                    className="rounded-xl border border-violet-200 bg-violet-50/50 p-3"
                  >
                    <p className="font-medium text-slate-900">{burst.empName}</p>
                    <p className="text-xs text-slate-600">
                      {t('burstSize')}: {burst.biggestBurstSize} · {t('burstWindow')}: {burst.burstCount}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('burstRange')}: {formatDate(burst.burstStart)} → {formatDate(burst.burstEnd)}
                    </p>
                    {burst.tasks?.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                        {burst.tasks.slice(0, 8).map((t, i) => (
                          <li key={i}>
                            {t.title} — {formatDate(t.completedAt)}
                          </li>
                        ))}
                        {burst.tasks.length > 8 && (
                          <li className="text-slate-500">+{burst.tasks.length - 8} more</li>
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
