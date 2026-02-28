'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type AuditItem = {
  id: string;
  createdAt: string;
  module: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  targetEmployeeId: string | null;
  targetEmployeeName: string | null;
  targetDate: string | null;
  weekStart: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
  actor: { id: string; empId: string; role: string; name: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  WEEK_SAVE: 'Week batch save',
  OVERRIDE_CREATED: 'Override created',
  OVERRIDE_UPDATED: 'Override updated',
  OVERRIDE_DELETED: 'Override deleted',
  COVERAGE_SUGGESTION_APPLY: 'Coverage suggestion applied',
  LOCK_DAY: 'Day locked',
  UNLOCK_DAY: 'Day unlocked',
  LOCK_WEEK: 'Week locked',
  UNLOCK_WEEK: 'Week unlocked',
  WEEK_APPROVED: 'Week approved',
  WEEK_UNAPPROVED: 'Week unapproved',
  TEAM_CHANGE_CREATED: 'Team change created',
  ZONE_COMPLETED: 'Zone completed',
  WEEKLY_COMPLETE_ALL: 'Weekly zones completed',
  INVENTORY_DAILY_RECOMPUTE: 'Daily inventory recomputed',
  APPROVAL_REQUEST_CREATED: 'Approval requested',
  APPROVAL_APPROVED: 'Approval approved',
  APPROVAL_REJECTED: 'Approval rejected',
};

function getCurrentWeekStart(): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const day = today.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  today.setUTCDate(today.getUTCDate() - daysBack);
  return today.toISOString().slice(0, 10);
}

function auditActionColor(action: string, module: string | null): string {
  if (module === 'LOCK') {
    if (action.includes('LOCK')) return 'border-l-4 border-rose-400 bg-rose-50/50';
    if (action.includes('UNLOCK')) return 'border-l-4 border-emerald-400 bg-emerald-50/50';
  }
  if (module === 'SCHEDULE') {
    if (action.includes('LOCK') || action.includes('APPROVED')) return 'border-l-4 border-rose-400 bg-rose-50/50';
    if (action.includes('UNLOCK') || action.includes('UNAPPROVED')) return 'border-l-4 border-emerald-400 bg-emerald-50/50';
    if (action.includes('OVERRIDE') || action.includes('COVERAGE')) return 'border-l-4 border-sky-400 bg-sky-50/50';
  }
  if (module === 'TEAM') return 'border-l-4 border-amber-400 bg-amber-50/50';
  if (module === 'INVENTORY') return 'border-l-4 border-purple-400 bg-purple-50/50';
  if (module === 'APPROVALS') return 'border-l-4 border-indigo-400 bg-indigo-50/50';
  return 'border-l-4 border-slate-300 bg-slate-50/50';
}

function formatBeforeAfterSummary(before: string | null, after: string | null): string {
  if (!before && !after) return '';
  try {
    const b = before ? JSON.parse(before) : null;
    const a = after ? JSON.parse(after) : null;
    const parts: string[] = [];
    if (b && typeof b === 'object') {
      if (b.overrideShift != null) parts.push(`Before: ${b.overrideShift}`);
      if (b.reason) parts.push(`Reason: ${b.reason}`);
      if (b.empId) parts.push(`Employee: ${b.empId}`);
      if (b.date) parts.push(`Date: ${b.date}`);
    }
    if (a && typeof a === 'object') {
      if (a.team && a.effectiveFrom) {
        const fromTeam = b && typeof b === 'object' && b.team != null ? b.team : '?';
        parts.push(`Team ${fromTeam} → ${a.team} effective ${a.effectiveFrom}`);
      }
      if (a.newTeam && a.effectiveFrom && !parts.some((p) => p.includes('effective'))) {
        const fromTeam = b && typeof b === 'object' && b.previousTeam != null ? b.previousTeam : '?';
        parts.push(`Team ${fromTeam} → ${a.newTeam} effective ${a.effectiveFrom}`);
      }
      if (a.overrideShift != null) parts.push(`After: ${a.overrideShift}`);
      if (a.reason) parts.push(`Reason: ${a.reason}`);
      if (a.empId) parts.push(`Employee: ${a.empId}`);
      if (a.weekStart) parts.push(`Week: ${a.weekStart}`);
      if (a.statusRevertedTo) parts.push(`Reverted to: ${a.statusRevertedTo}`);
    }
    return parts.length ? parts.join(' · ') : (before || '') + (after ? ' → ' + after : '');
  } catch {
    return [before, after].filter(Boolean).join(' → ') || '';
  }
}

export function ScheduleAuditClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    module: '',
    weekStart: getCurrentWeekStart(),
    dateFrom: '',
    dateTo: '',
    employeeId: '',
    actor: '',
    actionType: '',
  });

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (filters.module) params.set('module', filters.module);
    if (filters.weekStart) params.set('weekStart', filters.weekStart);
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
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">
          {t('governance.auditTitle')}
        </h1>

        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">{t('governance.filters') ?? 'Filters'}</p>
          <div className="flex flex-wrap gap-3 overflow-x-auto pb-1">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-600">{t('governance.filterModule') ?? 'Module'}</span>
              <select
                value={filters.module}
                onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('common.all') ?? 'All'}</option>
                <option value="SCHEDULE">Schedule</option>
                <option value="INVENTORY">Inventory</option>
                <option value="TEAM">Team</option>
                <option value="LOCK">Lock</option>
                <option value="APPROVALS">Approvals</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-600">{t('governance.filterWeek') ?? 'Week'}</span>
              <input
                type="date"
                value={filters.weekStart}
                onChange={(e) => setFilters((f) => ({ ...f, weekStart: e.target.value }))}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
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
              <span className="text-slate-600">{t('governance.filterActor') ?? 'Actor (user ID)'}</span>
              <input
                type="text"
                value={filters.actor}
                onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value.trim() }))}
                placeholder="user id"
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
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
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
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 md:text-sm">Module</th>
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
                    <td colSpan={7} className="px-4 py-3 text-center text-sm text-slate-600">
                      {t('governance.noAuditEntries') ?? 'No audit entries.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={`border-b border-slate-200 hover:bg-slate-50 ${auditActionColor(item.action, item.module)}`}>
                      <td className="px-3 py-2 text-xs text-slate-600 md:text-sm">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-700 md:text-sm">
                        {item.module ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-900 md:text-sm">
                        {ACTION_LABELS[item.action] ?? item.action}
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
                        {formatBeforeAfterSummary(item.beforeJson, item.afterJson) || '—'}
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
      </div>
    </div>
  );
}
