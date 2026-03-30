'use client';

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableBody, AdminTableHead, AdminTd, AdminTh } from '@/components/admin/AdminDataTable';

type Row = {
  id: string;
  internalTaskKey: string;
  plannerTaskTitle: string | null;
  taskType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  branchCode: string | null;
  completedByName: string | null;
  completedByEmail: string | null;
  completedOnDateKey: string;
  completedAt: string;
  source: string;
  completedByUser: { id: string; empId: string; employee?: { name?: string | null } | null } | null;
};

type ApiResponse = { total: number; rows: Row[]; error?: string };

export function PlannerCompletionsClient() {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [type, setType] = useState('');
  const [branchCode, setBranchCode] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    if (type) p.set('type', type);
    if (branchCode) p.set('branchCode', branchCode.trim().toUpperCase());
    p.set('limit', '300');
    return p.toString();
  }, [dateFrom, dateTo, type, branchCode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/integrations/planner/completions?${qs}`)
      .then(async (r) => {
        const j = (await r.json()) as ApiResponse;
        if (!r.ok) throw new Error(j.error ?? 'Failed');
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setRows(j.rows ?? []);
        setTotal(j.total ?? 0);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('admin.planner.completionsTitle')}>
        <p className="mb-4 text-sm text-muted">{t('admin.planner.completionsSubtitle')}</p>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted">
            {t('admin.planner.filterDateFrom')}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.planner.filterDateTo')}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted">
            {t('admin.planner.filterType')}
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t('common.all')}</option>
              <option value="DAILY">DAILY</option>
              <option value="WEEKLY">WEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            {t('admin.planner.filterBranch')}
            <input
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              placeholder="RASHID"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>{t('admin.planner.totalRows').replace('{n}', String(total))}</span>
          {loading ? <span>{t('common.loading')}</span> : null}
        </div>
        {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

        <AdminDataTable stickyHeader zebra>
          <AdminTableHead>
            <AdminTh>{t('common.date')}</AdminTh>
            <AdminTh>{t('admin.planner.colTaskKey')}</AdminTh>
            <AdminTh>{t('admin.planner.colTaskTitle')}</AdminTh>
            <AdminTh>{t('admin.planner.colType')}</AdminTh>
            <AdminTh>{t('admin.planner.colBranch')}</AdminTh>
            <AdminTh>{t('admin.planner.colCompletedBy')}</AdminTh>
            <AdminTh>{t('admin.planner.colMatchedUser')}</AdminTh>
            <AdminTh>{t('admin.planner.colSource')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="tabular-nums">{r.completedOnDateKey}</AdminTd>
                <AdminTd>{r.internalTaskKey}</AdminTd>
                <AdminTd title={r.plannerTaskTitle ?? undefined}>{r.plannerTaskTitle ?? '—'}</AdminTd>
                <AdminTd>{r.taskType}</AdminTd>
                <AdminTd>{r.branchCode ?? '—'}</AdminTd>
                <AdminTd title={r.completedByEmail ?? undefined}>
                  {r.completedByName ?? r.completedByEmail ?? '—'}
                </AdminTd>
                <AdminTd>
                  {r.completedByUser
                    ? `${r.completedByUser.employee?.name ?? r.completedByUser.empId} (${r.completedByUser.empId})`
                    : '—'}
                </AdminTd>
                <AdminTd>{r.source}</AdminTd>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted">
                  {t('admin.planner.noCompletions')}
                </td>
              </tr>
            ) : null}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>
    </div>
  );
}

