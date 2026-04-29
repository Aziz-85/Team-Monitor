'use client';

import { useMemo } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { formatSarInt } from '@/lib/utils/money';
import type { EmployeeProductivityRollup } from '@/lib/sales-analytics/types';

export type ProductivityRow = {
  id: string;
  name: string;
  totalSalesMTD: number;
  activeDays: number;
  avgDailySales: number;
  contributionPct: number;
  employeeProductivity?: EmployeeProductivityRollup;
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
    productivityInvoices?: string;
    productivityPieces?: string;
    productivityAvgTicket?: string;
    productivityUpt?: string;
  };
  loading?: boolean;
};

function hasInvoicePieceSignal(p: EmployeeProductivityRollup | undefined): boolean {
  if (!p) return false;
  return p.totalInvoiceCount > 0 || p.totalPieceCount > 0;
}

export function ProductivityTable({ title, subtitle, rows, labels, loading }: Props) {
  const showTicketColumns = useMemo(
    () => rows.some((r) => hasInvoicePieceSignal(r.employeeProductivity)),
    [rows]
  );

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
            <AdminTh className="text-end tabular-nums">{labels.totalMtd}</AdminTh>
            <AdminTh className="text-end tabular-nums">{labels.activeDays}</AdminTh>
            <AdminTh className="text-end tabular-nums">{labels.avgDaily}</AdminTh>
            <AdminTh className="text-end tabular-nums">{labels.contribution}</AdminTh>
            {showTicketColumns && labels.productivityInvoices ? (
              <AdminTh className="text-end tabular-nums">{labels.productivityInvoices}</AdminTh>
            ) : null}
            {showTicketColumns && labels.productivityPieces ? (
              <AdminTh className="text-end tabular-nums">{labels.productivityPieces}</AdminTh>
            ) : null}
            {showTicketColumns && labels.productivityAvgTicket ? (
              <AdminTh className="text-end tabular-nums">{labels.productivityAvgTicket}</AdminTh>
            ) : null}
            {showTicketColumns && labels.productivityUpt ? (
              <AdminTh className="text-end tabular-nums">{labels.productivityUpt}</AdminTh>
            ) : null}
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const p = r.employeeProductivity;
              const ticket = p?.averageTicketSar;
              const upt = p?.unitsPerTransaction;
              return (
                <tr key={r.id}>
                  <AdminTd className="min-w-0 truncate font-medium" title={r.name}>
                    {r.name}
                  </AdminTd>
                  <AdminTd className="text-end tabular-nums">{formatSarInt(r.totalSalesMTD)}</AdminTd>
                  <AdminTd className="text-end tabular-nums">{r.activeDays}</AdminTd>
                  <AdminTd className="text-end tabular-nums">{formatSarInt(r.avgDailySales)}</AdminTd>
                  <AdminTd className="text-end tabular-nums">{r.contributionPct}%</AdminTd>
                  {showTicketColumns && labels.productivityInvoices ? (
                    <AdminTd className="text-end tabular-nums">
                      {hasInvoicePieceSignal(p) ? (p!.totalInvoiceCount.toLocaleString('en-US')) : '—'}
                    </AdminTd>
                  ) : null}
                  {showTicketColumns && labels.productivityPieces ? (
                    <AdminTd className="text-end tabular-nums">
                      {hasInvoicePieceSignal(p) ? (p!.totalPieceCount.toLocaleString('en-US')) : '—'}
                    </AdminTd>
                  ) : null}
                  {showTicketColumns && labels.productivityAvgTicket ? (
                    <AdminTd className="text-end tabular-nums">
                      {ticket != null && hasInvoicePieceSignal(p)
                        ? formatSarInt(Math.round(ticket))
                        : '—'}
                    </AdminTd>
                  ) : null}
                  {showTicketColumns && labels.productivityUpt ? (
                    <AdminTd className="text-end tabular-nums">
                      {upt != null && hasInvoicePieceSignal(p) ? upt.toFixed(1) : '—'}
                    </AdminTd>
                  ) : null}
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </OpsCard>
  );
}
