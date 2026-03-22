/**
 * Branch-specific yearly / wide-calendar sales import template.
 * Sheet name must match `Import_YYYY` (see `parseYearlyImportExcel`).
 */

import * as XLSX from 'xlsx';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { prisma } from '@/lib/db';

const README = 'README';

export type YearlyTemplateMode = 'default' | 'historical_initial' | 'historical_correction';

export async function buildYearlySalesTemplateForBoutique(
  boutiqueId: string,
  year: string,
  options?: { mode?: YearlyTemplateMode }
): Promise<Buffer> {
  const mode = options?.mode ?? 'default';
  if (!/^\d{4}$/.test(year)) throw new Error('year must be YYYY');

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!boutique) throw new Error('Boutique not found');

  const employeesRaw = await prisma.employee.findMany({
    where: { boutiqueId, active: true },
    select: { empId: true, name: true, isSystemOnly: true },
    orderBy: [{ empId: 'asc' }],
  });
  const employees = filterOperationalEmployees(employeesRaw);

  const sheetName = `Import_${year}`;
  const headers: string[] = ['Date', ...employees.map((e) => `emp_${(e.empId ?? '').trim()}`)];
  const aoa: unknown[][] = [headers];

  const y = parseInt(year, 10);
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(y, mi + 1, 0).getDate();
    const m = mi + 1;
    for (let d = 1; d <= dim; d++) {
      const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      aoa.push([dateKey, ...employees.map(() => '')]);
    }
  }

  const title =
    mode === 'historical_initial'
      ? 'HISTORICAL INITIAL SALES IMPORT — SalesEntry only (insert-if-empty; no overwrite)'
      : mode === 'historical_correction'
        ? 'HISTORICAL CORRECTION SALES IMPORT — update existing rows only (MANUAL rows excluded)'
        : 'YEARLY SALES IMPORT — system-generated template';

  const uploadHint =
    mode === 'historical_initial'
      ? [
          ['- Upload: POST /api/admin/import-center/historical-sales/initial (ADMIN). Dry-run recommended first.'],
          ['- Policy: inserts only when no SalesEntry row exists for boutique+date+employee; rejects if exists.'],
        ]
      : mode === 'historical_correction'
        ? [
            ['- Upload: POST /api/admin/import-center/historical-sales/correction (ADMIN). Reason required.'],
            ['- Policy: updates only existing non-MANUAL SalesEntry rows; missing rows are rejected.'],
          ]
        : [
            [
              '- Upload via Import Center → Sales → Yearly import API (/api/sales/import/yearly) with operational scope.',
            ],
          ];

  const readmeRows: unknown[][] = [
    [title],
    [],
    ['boutiqueId', boutique.id],
    ['boutiqueCode', boutique.code ?? ''],
    ['boutiqueName', boutique.name ?? ''],
    ['year', year],
    ['templateMode', mode],
    ['sheetRequired', sheetName],
    [],
    ['Rules:'],
    ['- Do not rename the data sheet; must be exactly: ' + sheetName],
    ['- First column must stay "Date" (YYYY-MM-DD).'],
    ['- Employee columns are emp_<EmpId> only — one column per active employee in THIS boutique today.'],
    ['- If an employee transferred mid-year: use THIS file only for dates while they were in THIS boutique.'],
    ['  Import the same person in another boutique file for rows that belong to the other branch.'],
    ['- Amounts: integer SAR (or decimals rounded). Empty or "-" skips.'],
    ...uploadHint,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wsR = XLSX.utils.aoa_to_sheet(readmeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.utils.book_append_sheet(wb, wsR, README);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
