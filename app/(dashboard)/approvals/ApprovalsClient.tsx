'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

type ApprovalItem = {
  id: string;
  module: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: string;
  requestedAt: string;
  effectiveDate: string | null;
  weekStart: string | null;
  requestedBy: {
    userId: string;
    empId: string;
    role: string;
    name: string;
  } | null;
};

const ACTION_KEYS: Record<string, string> = {
  OVERRIDE_CREATE: 'governance.actionOverrideCreate',
  WEEK_SAVE: 'governance.actionWeekSave',
  TEAM_CHANGE: 'governance.actionTeamChange',
  EDIT_SALES_DAY: 'targets.actionEditSalesDay',
};

const MODULE_KEYS: Record<string, string> = {
  SCHEDULE: 'governance.moduleSchedule',
  TEAM: 'governance.moduleTeam',
  INVENTORY: 'governance.moduleInventory',
  SALES: 'targets.moduleSales',
};

/** Page <h1> i18n key for approvals list (matches nav labels). */
const PAGE_TITLE_KEYS: Record<string, string> = {
  '': 'nav.approvalsAll',
  SCHEDULE: 'nav.approvalsForSchedule',
  TEAM: 'nav.approvalsForTeam',
  INVENTORY: 'nav.approvalsForInventory',
  SALES: 'nav.approvalsForSales',
};

const ALLOWED_MODULES = new Set(['', 'SCHEDULE', 'TEAM', 'INVENTORY', 'SALES']);

function payloadSummary(payload: Record<string, unknown>, actionType: string): string {
  const parts: string[] = [];
  if (payload.empId) parts.push(`Emp: ${payload.empId}`);
  if (payload.date) parts.push(`Date: ${payload.date}`);
  if (payload.effectiveFrom) parts.push(`Effective: ${payload.effectiveFrom}`);
  if (payload.newTeam) parts.push(`Team: ${payload.newTeam}`);
  if (payload.reason) parts.push(`Reason: ${payload.reason}`);
  if (payload.note) parts.push(`Note: ${payload.note}`);
  if (actionType === 'WEEK_SAVE' && Array.isArray(payload.changes)) {
    parts.push(`${payload.changes.length} change(s)`);
  }
  return parts.length ? parts.join(' · ') : JSON.stringify(payload).slice(0, 80);
}

type ApprovalsClientProps = {
  /** Pre-fill module filter (e.g. "SALES" for sales edit requests page). */
  initialModule?: string;
};

export function ApprovalsClient({ initialModule = '' }: ApprovalsClientProps) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const urlModule = searchParams.get('module') ?? '';
  const moduleFromUrl = ALLOWED_MODULES.has(urlModule) ? urlModule : '';
  const effectiveModule = initialModule || moduleFromUrl;

  const [filters, setFilters] = useState({
    module: effectiveModule,
    weekStart: '',
    effectiveDate: '',
  });

  useEffect(() => {
    const next = initialModule || moduleFromUrl;
    setFilters((f) => (f.module === next ? f : { ...f, module: next }));
  }, [initialModule, moduleFromUrl]);

  const pageTitleKey = PAGE_TITLE_KEYS[filters.module] ?? PAGE_TITLE_KEYS[''];

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.module) params.set('module', filters.module);
    if (filters.weekStart) params.set('weekStart', filters.weekStart);
    if (filters.effectiveDate) params.set('effectiveDate', filters.effectiveDate);
    return `/api/approvals?${params.toString()}`;
  }, [filters]);

  const fetchList = useCallback(() => {
    setLoading(true);
    fetch(buildUrl())
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const replaceModuleInUrl = useCallback(
    (module: string) => {
      if (initialModule) return;
      const params = new URLSearchParams(searchParams.toString());
      if (module) params.set('module', module);
      else params.delete('module');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [initialModule, pathname, router, searchParams]
  );

  const handleApprove = useCallback(
    async (id: string, comment?: string) => {
      setActioningId(id);
      try {
        const res = await fetch(`/api/approvals/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: comment || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setItems((prev) => prev.filter((r) => r.id !== id));
        } else {
          alert(data.error ?? 'Approve failed');
        }
      } catch (e) {
        alert((e as Error).message ?? 'Request failed');
      } finally {
        setActioningId(null);
      }
    },
    []
  );

  const handleReject = useCallback(
    async (id: string, comment?: string) => {
      setActioningId(id);
      try {
        const res = await fetch(`/api/approvals/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: comment || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setItems((prev) => prev.filter((r) => r.id !== id));
        } else {
          alert(data.error ?? 'Reject failed');
        }
      } catch (e) {
        alert((e as Error).message ?? 'Request failed');
      } finally {
        setActioningId(null);
      }
    },
    []
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-xl font-semibold text-foreground">{t(pageTitleKey)}</h1>

        <div className="mb-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-foreground">{t('governance.filters')}</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">{t('governance.filterModule')}</span>
              <select
                value={filters.module}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((f) => ({ ...f, module: v }));
                  replaceModuleInUrl(v);
                }}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">All</option>
                <option value="SCHEDULE">{t('governance.moduleSchedule')}</option>
                <option value="TEAM">{t('governance.moduleTeam')}</option>
                <option value="INVENTORY">{t('governance.moduleInventory')}</option>
                <option value="SALES">{t('targets.moduleSales')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">{t('governance.weekOptional') ?? t('governance.filterWeek')}</span>
              <input
                type="date"
                value={filters.weekStart}
                onChange={(e) => setFilters((f) => ({ ...f, weekStart: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">{t('governance.effectiveDate')}</span>
              <input
                type="date"
                value={filters.effectiveDate}
                onChange={(e) => setFilters((f) => ({ ...f, effectiveDate: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={fetchList}
                className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.requested')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.module')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.action')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.requestedBy')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.effectiveOrWeek')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.summary')}
                  </th>
                  <th className="px-3 py-2 text-start text-xs font-semibold text-foreground">
                    {t('governance.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted">
                      {t('governance.noPendingApprovals')}
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-surface-subtle">
                      <td className="px-3 py-2 text-xs text-muted">
                        {new Date(row.requestedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {MODULE_KEYS[row.module] ? t(MODULE_KEYS[row.module]) : row.module}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {ACTION_KEYS[row.actionType] ? t(ACTION_KEYS[row.actionType]) : row.actionType}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {row.requestedBy ? (
                          <span className="inline-flex items-center rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-xs font-medium">
                            {row.requestedBy.name} ({getRoleDisplayLabel(row.requestedBy.role as Role, null, t)})
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {row.effectiveDate ?? row.weekStart ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-muted max-w-[200px] truncate" title={payloadSummary(row.payload, row.actionType)}>
                        {payloadSummary(row.payload, row.actionType)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actioningId !== null}
                            onClick={() => handleApprove(row.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {t('governance.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={actioningId !== null}
                            onClick={() => handleReject(row.id)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            {t('governance.reject')}
                          </button>
                        </div>
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
