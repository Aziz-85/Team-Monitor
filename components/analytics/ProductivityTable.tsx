'use client';

import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { formatSarInt } from '@/lib/utils/money';

export type ProductivityRow = {
  id: string;
  name: string;
  totalSalesMTD: number;
  activeDays: number;
  avgDailySales: number;
  contributionPct: number;
};

type Props = {
  title: string;
  subtitle?: string;
  rows: ProductivityRow[];
  labels: {
    employee: string;
    totalMtd: string;
    activeDays: string;
    avgDaily: string;
    contribution: string;
  };
  loading?: boolean;
};

export function ProductivityTable({ title, subtitle, rows, labels, loading }: Props) {
  return (
    <OpsCard title={title}>
      {subtitle ? <p className="mb-3 text-sm text-muted">{subtitle}</p> : null}
      {loading && <p className="text-sm text-muted">…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted">—</p>
      )}
      {!loading && rows.length > 0 && (
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh className="min-w-0">{labels.employee}</AdminTh>
            <AdminTh className="tabular-nums">{labels.totalMtd}</AdminTh>
            <AdminTh className="tabular-nums">{labels.activeDays}</AdminTh>
            <AdminTh className="tabular-nums">{labels.avgDaily}</AdminTh>
            <AdminTh className="tabular-nums">{labels.contribution}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="min-w-0 truncate font-medium" title={r.name}>
                  {r.name}
                </AdminTd>
                <AdminTd className="tabular-nums">{formatSarInt(r.totalSalesMTD)}</AdminTd>
                <AdminTd className="tabular-nums">{r.activeDays}</AdminTd>
                <AdminTd className="tabular-nums">{formatSarInt(r.avgDailySales)}</AdminTd>
                <AdminTd className="tabular-nums">{r.contributionPct}%</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </OpsCard>
  );
}
