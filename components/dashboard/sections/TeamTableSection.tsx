'use client';

import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarFromHalala } from '@/lib/utils/money';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';

type Row = {
  empId?: string;
  employee: string;
  role: string;
  roleLabel?: string;
  target: number;
  actual: number;
  pct: number;
  tasksDone: number;
  late: number;
  zone: string | null;
};

export function TeamTableSection({ rows }: { rows: Row[] }) {
  if (!rows?.length) return null;

  return (
    <OpsCard title="Team" className="overflow-hidden rounded-2xl border border-border shadow-sm">
      <DataTable variant="luxury" zebra noScroll>
        <DataTableHead>
          <DataTableTh className="text-start">Employee</DataTableTh>
          <DataTableTh className="text-start">Role</DataTableTh>
          <DataTableTh className="text-end">Target</DataTableTh>
          <DataTableTh className="text-end">Actual</DataTableTh>
          <DataTableTh className="text-end">%</DataTableTh>
          <DataTableTh className="text-end">Tasks</DataTableTh>
          <DataTableTh className="text-end">Late</DataTableTh>
          <DataTableTh className="text-start">Zone</DataTableTh>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <tr key={r.empId ?? r.employee}>
              <DataTableTd className="font-medium text-foreground">{r.employee}</DataTableTd>
              <DataTableTd>
                <span className="inline-flex rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-foreground">
                  {r.roleLabel ?? r.role}
                </span>
              </DataTableTd>
              <DataTableTd className="text-end text-foreground">{formatSarFromHalala(r.target)}</DataTableTd>
              <DataTableTd className="text-end text-foreground">{formatSarFromHalala(r.actual)}</DataTableTd>
              <DataTableTd
                className={`text-end font-medium ${
                  r.pct >= 60 ? 'text-foreground' : r.pct >= 40 ? 'text-amber-600' : 'text-luxury-error'
                }`}
              >
                {r.pct}%
              </DataTableTd>
              <DataTableTd className="text-end">{r.tasksDone}</DataTableTd>
              <DataTableTd className="text-end">{r.late}</DataTableTd>
              <DataTableTd className="text-muted">{r.zone ?? '—'}</DataTableTd>
            </tr>
          ))}
        </DataTableBody>
      </DataTable>
    </OpsCard>
  );
}
