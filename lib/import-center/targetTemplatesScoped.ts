/**
 * Boutique-scoped target templates — column order matches `lib/targets/importBoutiques.ts` / `importEmployees.ts`.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import {
  BOUTIQUE_SHEET,
  BOUTIQUE_HEADERS,
  EMPLOYEE_SHEET,
  EMPLOYEE_HEADERS,
} from '@/lib/targets/templates';

const README = 'README';

function nextNMonthKeys(n: number, start: Date): string[] {
  const out: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function buildBoutiqueTargetsTemplateScoped(boutiqueId: string): Promise<Buffer> {
  const b = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!b) throw new Error('Boutique not found');

  const months = nextNMonthKeys(6, new Date());
  const code = (b.code ?? '').trim();
  const name = (b.name ?? '').trim();
  const dataRows: unknown[][] = [BOUTIQUE_HEADERS];
  for (const mk of months) {
    dataRows.push([mk, code, name, '', 'OFFICIAL', '']);
  }

  const readme: unknown[][] = [
    ['BOUTIQUE TARGETS — branch-specific template'],
    ['boutiqueId', b.id],
    ['scopeId', code],
    [],
    ['Fill Target (integer SAR) per row. Sheet name must be:', BOUTIQUE_SHEET],
    ['POST preview: /api/targets/import/boutiques/preview then apply: /api/targets/import/boutiques/apply'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), BOUTIQUE_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), README);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function buildEmployeeTargetsTemplateScoped(
  boutiqueId: string,
  monthKey: string
): Promise<Buffer> {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('month must be YYYY-MM');

  const b = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!b) throw new Error('Boutique not found');

  const employeesRaw = await prisma.employee.findMany({
    where: { boutiqueId, active: true },
    select: { empId: true, name: true, isSystemOnly: true },
    orderBy: [{ empId: 'asc' }],
  });
  const employees = filterOperationalEmployees(employeesRaw);

  const code = (b.code ?? '').trim();
  const bname = (b.name ?? '').trim();
  const dataRows: unknown[][] = [EMPLOYEE_HEADERS];
  for (const e of employees) {
    dataRows.push([
      monthKey,
      code,
      bname,
      (e.empId ?? '').trim(),
      (e.name ?? '').trim(),
      '',
      'OFFICIAL',
      '',
    ]);
  }

  const readme: unknown[][] = [
    ['EMPLOYEE TARGETS — branch-specific template'],
    ['boutiqueId', b.id],
    ['month', monthKey],
    [],
    ['EmployeeCode (empId) is the stable key — names may change.'],
    ['Transfers: historical months belong to the boutique on the row; same person in another branch uses another file.'],
    ['Sheet name must be:', EMPLOYEE_SHEET],
    ['POST /api/targets/import/employees/preview then /api/targets/import/employees/apply'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), EMPLOYEE_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), README);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
