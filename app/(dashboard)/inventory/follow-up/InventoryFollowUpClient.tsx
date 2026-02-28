'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';
import { getWeekStartSaturday } from '@/lib/utils/week';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

function weekStartFor(date: Date): string {
  const start = getWeekStartSaturday(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDDMM(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAY_NAMES[d.getUTCDay()];
}

type DailyDay = {
  date: string;
  status: string;
  effectiveStatus: string;
  assignedEmpId: string | null;
  assignedName: string | null;
  completedByEmpId: string | null;
  completedByName: string | null;
  completedAt: string | null;
  reason: string | null;
  skipCount: number;
  skipSummary: Array<{ empId: string; name: string; skipReason: string }>;
};

type Projection = {
  date: string;
  projectedEmpId: string | null;
  projectedName: string | null;
  note: string;
};

type WeeklyData = {
  weekStart: string;
  summary: { totalZones: number; completedZones: number; pendingZones: number };
  byEmployee: Array<{
    empId: string;
    name: string;
    total: number;
    completed: number;
    pending: number;
    pendingZoneCodes: string[];
  }>;
  pendingZones: Array<{
    zoneCode: string;
    zoneName: string | null;
    empId: string;
    name: string;
    status: string;
    effectiveStatus: string;
  }>;
};

function StatusPill({ status, effectiveStatus, label }: { status: string; effectiveStatus?: string; label: string }) {
  const eff = effectiveStatus ?? status;
  const cls =
    eff === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : eff === 'LATE' || status === 'UNASSIGNED'
        ? 'bg-red-50 text-red-900 border-red-200'
        : 'bg-amber-50 text-amber-900 border-amber-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function InventoryFollowUpClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultFrom = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  })();

  const [tab, setTab] = useState<'daily' | 'weekly' | 'audit'>('daily');
  const [dailyFrom, setDailyFrom] = useState(defaultFrom);
  const [dailyTo, setDailyTo] = useState(todayStr);
  const [dailyData, setDailyData] = useState<{
    range: { from: string; to: string };
    days: DailyDay[];
    today: DailyDay | null;
    absentsByDate?: Record<string, Array<{ empId: string; name: string; reason: string | null }>>;
  } | null>(null);
  const [nextData, setNextData] = useState<{ from: string; days: number; projections: Projection[] } | null>(null);
  const [nextDaysCount, setNextDaysCount] = useState(14);
  const [weekStart, setWeekStart] = useState(weekStartFor(new Date()));
  const [weeklyData, setWeeklyData] = useState<WeeklyData | null>(null);

  useEffect(() => {
    if (tab !== 'daily') return;
    fetch(`/api/inventory/follow-up/daily?from=${dailyFrom}&to=${dailyTo}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setDailyData)
      .catch(() => setDailyData(null));
  }, [tab, dailyFrom, dailyTo]);

  useEffect(() => {
    if (tab !== 'daily') return;
    fetch(`/api/inventory/follow-up/daily/next?from=${todayStr}&days=${nextDaysCount}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setNextData)
      .catch(() => setNextData(null));
  }, [tab, todayStr, nextDaysCount]);

  useEffect(() => {
    if (tab !== 'weekly') return;
    fetch(`/api/inventory/follow-up/weekly?weekStart=${weekStart}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'summary' in data && Array.isArray((data as WeeklyData).byEmployee)) {
          setWeeklyData(data as WeeklyData);
        } else {
          setWeeklyData(null);
        }
      })
      .catch(() => setWeeklyData(null));
  }, [tab, weekStart]);

  useEffect(() => {
    if (tab !== 'daily') return;
    fetch(`/api/inventory/follow-up/weekly?weekStart=${weekStartFor(new Date())}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'summary' in data && Array.isArray((data as WeeklyData).byEmployee)) {
          setWeeklyData(data as WeeklyData);
        } else {
          setWeeklyData(null);
        }
      })
      .catch(() => setWeeklyData(null));
  }, [tab]);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <Link href="/inventory/daily" className="mb-4 inline-block text-base text-sky-600 hover:underline">
          ← {t('common.back')}
        </Link>
        <h1 className="mb-4 text-xl font-semibold text-slate-900">{t('inventory.followUp')}</h1>

        <div className="mb-4 inline-flex h-9 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'daily'}
            onClick={() => setTab('daily')}
            className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
              tab === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('inventory.followUpDaily')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'weekly'}
            onClick={() => setTab('weekly')}
            className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
              tab === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('inventory.followUpWeeklyZones')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'audit'}
            onClick={() => setTab('audit')}
            className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
              tab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('governance.auditTitle') ?? 'Audit'}
          </button>
        </div>

        {tab === 'daily' && (
          <>
            {/* Risk indicators */}
            {dailyData && (
              <div className="mb-4 space-y-2">
                {dailyData.today?.effectiveStatus === 'LATE' && (
                  <div className="rounded-xl border border-red-200 bg-red-100 px-4 py-3 text-sm font-medium text-red-900 shadow-sm">
                    {t('inventory.riskLateInventoryToday')}
                  </div>
                )}
                {weeklyData?.summary && (weeklyData.summary.pendingZones ?? 0) > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900 shadow-sm">
                    {t('inventory.riskPendingZonesThisWeek')}
                  </div>
                )}
                {dailyData.absentsByDate?.[todayStr] && dailyData.absentsByDate[todayStr].length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm">
                    <span className="font-medium text-slate-700">{t('inventory.absent')}:</span>
                    {dailyData.absentsByDate[todayStr].map((a) => (
                      <span key={a.empId} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        {a.name}
                        {a.reason ? ` (${a.reason})` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Today card */}
            {dailyData?.today && (
              <OpsCard title={t('inventory.followUpToday')} className="mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{dailyData.today.assignedName ?? '—'}</span>
                  <StatusPill
                    status={dailyData.today.status}
                    effectiveStatus={dailyData.today.effectiveStatus}
                    label={
                      dailyData.today.effectiveStatus === 'COMPLETED'
                        ? t('inventory.completed')
                        : dailyData.today.effectiveStatus === 'LATE'
                          ? t('inventory.late')
                          : dailyData.today.status === 'UNASSIGNED'
                            ? t('inventory.followUpUnassigned')
                            : t('inventory.pending')
                    }
                  />
                  {dailyData.today.status === 'COMPLETED' && dailyData.today.completedByName && (
                    <span className="text-sm text-slate-600">
                      {t('inventory.followUpCompletedBy')}: {dailyData.today.completedByName}
                      {dailyData.today.completedAt && (
                        <span className="ml-1">
                          {new Date(dailyData.today.completedAt).toLocaleString()}
                        </span>
                      )}
                    </span>
                  )}
                  {dailyData.today.status === 'UNASSIGNED' && (
                    <span className="text-sm font-medium text-red-700">{dailyData.today.reason ?? t('inventory.followUpUnassigned')}</span>
                  )}
                </div>
              </OpsCard>
            )}

            {/* Range + History */}
            <OpsCard title={t('inventory.followUpHistory')} className="mb-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{t('inventory.followUpRange')}</span>
                <input
                  type="date"
                  value={dailyFrom}
                  onChange={(e) => setDailyFrom(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={dailyTo}
                  onChange={(e) => setDailyTo(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                />
              </div>
              <ul className="space-y-2">
                {[...(dailyData?.days ?? [])]
                  .sort((a, b) => {
                    const lateA = a.effectiveStatus === 'LATE' ? 1 : 0;
                    const lateB = b.effectiveStatus === 'LATE' ? 1 : 0;
                    if (lateB !== lateA) return lateB - lateA;
                    return b.date.localeCompare(a.date);
                  })
                  .map((day) => (
                    <li
                      key={day.date}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        day.effectiveStatus === 'LATE' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <span className="font-medium text-slate-800">
                        {formatDDMM(day.date)} {dayName(day.date)}
                      </span>
                      <span className="text-slate-600">{day.assignedName ?? '—'}</span>
                      <StatusPill
                        status={day.status}
                        effectiveStatus={day.effectiveStatus}
                        label={
                          day.effectiveStatus === 'COMPLETED'
                            ? t('inventory.completed')
                            : day.effectiveStatus === 'LATE'
                              ? t('inventory.late')
                              : day.status === 'UNASSIGNED'
                                ? t('inventory.followUpUnassigned')
                                : t('inventory.pending')
                        }
                      />
                      {day.status === 'COMPLETED' && day.completedByName && (
                        <span className="text-slate-500">
                          {t('inventory.followUpCompletedBy')} {day.completedByName}
                        </span>
                      )}
                      {day.skipCount > 0 && (
                        <span className="text-xs text-slate-500">
                          {day.skipCount} skipped
                        </span>
                      )}
                      {dailyData?.absentsByDate?.[day.date] && dailyData.absentsByDate[day.date].length > 0 && (
                        <span className="text-xs text-slate-500">
                          {t('inventory.absent')}: {dailyData.absentsByDate[day.date].map((a) => a.name).join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </OpsCard>

            {/* Next up */}
            <OpsCard title={t('inventory.followUpNextUp')} className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">{t('inventory.followUpRange')}</label>
                <select
                  value={nextDaysCount}
                  onChange={(e) => setNextDaysCount(Number(e.target.value))}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                </select>
              </div>
              <p className="mb-2 text-xs text-slate-500">{t('inventory.followUpMayChange')}</p>
              <ul className="space-y-2">
                {(nextData?.projections ?? []).map((p) => (
                  <li
                    key={p.date}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {formatDDMM(p.date)} {dayName(p.date)}
                    </span>
                    <span className="text-slate-700">{p.projectedName ?? '—'}</span>
                    {p.note && (
                      <span className="text-xs text-slate-500">{p.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </OpsCard>
          </>
        )}

        {tab === 'weekly' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">{t('inventory.weekStart')}</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
              />
            </div>

            {weeklyData && weeklyData.summary && Array.isArray(weeklyData.byEmployee) && (
              <>
                <OpsCard title={t('inventory.followUpWeekSummary')} className="mb-4">
                  <div className="flex flex-wrap gap-4">
                    <span className="text-sm text-slate-700">
                      {t('inventory.followUpTotalZones')}: <strong>{weeklyData.summary.totalZones}</strong>
                    </span>
                    <span className="text-sm text-green-700">
                      {t('inventory.followUpCompletedZones')}: <strong>{weeklyData.summary.completedZones}</strong>
                    </span>
                    <span className="text-sm text-amber-700">
                      {t('inventory.followUpPendingCount')}: <strong>{weeklyData.summary.pendingZones}</strong>
                    </span>
                  </div>
                </OpsCard>

                <OpsCard title={t('inventory.followUpByEmployee')} className="mb-4">
                  <ul className="space-y-3">
                    {weeklyData.byEmployee.map((emp) => (
                      <li key={emp.empId} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <div className="font-medium leading-6 text-slate-900">{emp.name}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {emp.completed} / {emp.total} completed
                          {emp.pendingZoneCodes.length > 0 && (
                            <span className="ml-2">
                              Pending: {emp.pendingZoneCodes.join(', ')}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </OpsCard>

                <OpsCard title={t('inventory.followUpPendingZones')}>
                  <ul className="flex flex-wrap gap-3">
                    {[...(weeklyData.pendingZones ?? [])]
                      .sort((a, b) => ((b.effectiveStatus === 'LATE' ? 1 : 0) - (a.effectiveStatus === 'LATE' ? 1 : 0)))
                      .map((z) => (
                        <li
                          key={z.zoneCode}
                          className={`rounded-lg border px-3 py-2 ${
                            z.effectiveStatus === 'LATE' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                          }`}
                        >
                          <span className="text-lg font-semibold text-slate-900">{z.zoneCode}</span>
                          {z.zoneName && (
                            <span className="ml-1 text-sm text-slate-600">({z.zoneName})</span>
                          )}
                          <span className="ml-2 text-sm font-medium leading-6 text-slate-700">→ {z.name}</span>
                          {z.effectiveStatus === 'LATE' && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-900">
                              {t('inventory.late')}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                  {(weeklyData.pendingZones?.length ?? 0) === 0 && (
                    <p className="text-sm text-slate-500">All zones completed for this week.</p>
                  )}
                </OpsCard>
              </>
            )}
          </>
        )}

        {tab === 'audit' && <InventoryAuditTab t={t} />}
      </div>
    </div>
  );
}

type InventoryAuditItem = {
  id: string;
  createdAt: string;
  module: string | null;
  action: string;
  targetEmployeeId: string | null;
  targetEmployeeName: string | null;
  targetDate: string | null;
  weekStart: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
  actor: { id: string; empId: string; role: string; name: string } | null;
};

const INVENTORY_ACTION_LABELS: Record<string, string> = {
  ZONE_COMPLETED: 'Zone completed',
  WEEKLY_COMPLETE_ALL: 'Weekly zones completed',
  INVENTORY_DAILY_RECOMPUTE: 'Daily inventory recomputed',
};

function formatInventorySummary(before: string | null, after: string | null): string {
  if (!before && !after) return '';
  try {
    const b = before ? JSON.parse(before) : null;
    const a = after ? JSON.parse(after) : null;
    const parts: string[] = [];
    if (b && typeof b === 'object') {
      if (b.status) parts.push(`Before: ${b.status}`);
      if (b.assignedEmpId) parts.push(`Assigned: ${b.assignedEmpId}`);
    }
    if (a && typeof a === 'object') {
      if (a.status) parts.push(`After: ${a.status}`);
      if (a.completedByEmpId) parts.push(`Completed by: ${a.completedByEmpId}`);
      if (a.updatedCount !== undefined) parts.push(`Updated: ${a.updatedCount}`);
    }
    return parts.length ? parts.join(' · ') : '';
  } catch {
    return [before, after].filter(Boolean).join(' → ') || '';
  }
}

function InventoryAuditTab({ t }: { t: (key: string) => string }) {
  const [items, setItems] = useState<InventoryAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    employeeId: '',
    actor: '',
    actionType: '',
  });

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    params.set('module', 'INVENTORY');
    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.actor) params.set('actorUserId', filters.actor);
    if (filters.actionType) params.set('actionType', filters.actionType);
    return `/api/audit?${params.toString()}`;
  }, [filters]);

  const fetchAudit = useCallback(() => {
    setLoading(true);
    fetch(buildUrl())
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-900">{t('governance.filters') ?? 'Filters'}</p>
        <div className="flex flex-wrap gap-3 overflow-x-auto pb-1">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t('governance.dateFrom') ?? 'From'}</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t('governance.dateTo') ?? 'To'}</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t('governance.filterEmployee') ?? 'Employee (ID)'}</span>
            <input
              type="text"
              value={filters.employeeId}
              onChange={(e) => setFilters((f) => ({ ...f, employeeId: e.target.value.trim() }))}
              placeholder="empId"
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t('governance.filterActionType') ?? 'Action'}</span>
            <select
              value={filters.actionType}
              onChange={(e) => setFilters((f) => ({ ...f, actionType: e.target.value }))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('common.all') ?? 'All'}</option>
              {Object.entries(INVENTORY_ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchAudit}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('common.refresh') ?? 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t('common.loading') ?? 'Loading…'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Time</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Action</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Actor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Target</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Summary</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-center text-sm text-slate-600">
                    {t('governance.noAuditEntries') ?? 'No audit entries.'}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200 hover:bg-slate-50 border-l-4 border-l-purple-400 bg-purple-50/50">
                    <td className="px-3 py-2 text-xs text-slate-600 md:text-sm">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-slate-900 md:text-sm">
                      {INVENTORY_ACTION_LABELS[item.action] ?? item.action}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 md:text-sm">
                      {item.actor ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium">
                          {item.actor.name} ({getRoleDisplayLabel(item.actor.role as Role, null, t)})
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 md:text-sm">
                      <div className="space-y-0.5">
                        {item.targetEmployeeName && (
                          <div className="font-medium">{item.targetEmployeeName}</div>
                        )}
                        {item.targetDate && (
                          <div className="text-slate-500">Date: {item.targetDate}</div>
                        )}
                        {item.weekStart && (
                          <div className="text-slate-500">Week: {item.weekStart}</div>
                        )}
                        {!item.targetEmployeeName && !item.targetDate && !item.weekStart && '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 md:text-sm">
                      {formatInventorySummary(item.beforeJson, item.afterJson) || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 md:text-sm">
                      {item.reason || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
