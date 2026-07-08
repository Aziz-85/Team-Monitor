/**
 * Historical snapshot JSON pipeline template (admin/historical-import).
 * Column names align with `lib/historical-snapshots/parse.ts` findCol() matching.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { loadImportTemplateEmployees } from '@/lib/import-center/boutiqueTemplateScope';

const DATA_SHEET = 'HistoricalData';
const REF_SHEET = 'Employees_Ref';
const README = 'README';

/** Headers chosen so parseSheetToSnapshot resolves columns reliably. */
const DATA_HEADERS = ['Date', 'EmpId', 'Name', 'NetSales_SAR', 'Invoices', 'Pieces', 'AchievementPct'];

export async function buildHistoricalSnapshotTemplateForBoutique(
  boutiqueId: string,
  month: string
): Promise<Buffer> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!boutique) throw new Error('Boutique not found');

  const employees = await loadImportTemplateEmployees(boutiqueId);

  const exampleEmp = employees[0];
  const dataRows: unknown[][] = [
    DATA_HEADERS,
    exampleEmp
      ? [`${month}-01`, exampleEmp.empId, exampleEmp.name, 1000, 0, 0, 0]
      : ['YYYY-MM-DD', 'EMP_ID', 'Employee Name', 1000, 0, 0, 0],
  ];

  const refRows: unknown[][] = [
    ['EmpId', 'Name', 'Note'],
    ...employees.map((e) => [
      (e.empId ?? '').trim(),
      (e.name ?? '').trim(),
      'Reference only — rows in HistoricalData must use same EmpId for matching.',
    ]),
  ];

  const readmeRows: unknown[][] = [
    ['HISTORICAL SNAPSHOT IMPORT (writes JSON snapshot, not SalesEntry directly)'],
    [],
    ['boutiqueId', boutique.id],
    ['code', boutique.code ?? ''],
    ['name', boutique.name ?? ''],
    ['targetMonth', month],
    [],
    ['Data sheet:', DATA_SHEET],
    ['Required columns (order flexible; parser matches by header text):'],
    ...DATA_HEADERS.map((h) => [`- ${h}`]),
    [],
    ['NetSales_SAR: amounts in SAR (parser converts to internal halalas).'],
    ['Employee transfers: same EmpId may appear in another boutique file for other dates — scope by boutiqueId + row data.'],
    ['POST /api/admin/historical-import with file, boutiqueId, month.'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), DATA_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refRows), REF_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows), README);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
