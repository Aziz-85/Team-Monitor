/**
 * DATA_MATRIX month template — ScopeId column uses boutique **code** (matches /api/sales/import/matrix validation).
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { getMonthRangeDayKeys } from '@/lib/time';

export const MATRIX_SHEET_NAME = 'DATA_MATRIX';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function buildMatrixMonthTemplateForBoutique(
  boutiqueId: string,
  monthParam: string
): Promise<Buffer> {
  if (!/^\d{4}-\d{2}$/.test(monthParam)) throw new Error('month must be YYYY-MM');

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true },
  });
  if (!boutique) throw new Error('Boutique not found');

  const scopeCode = (boutique.code ?? '').trim();
  const employeesRaw = await prisma.employee.findMany({
    where: { boutiqueId, active: true },
    select: { empId: true, name: true, isSystemOnly: true },
    orderBy: [{ name: 'asc' }, { empId: 'asc' }],
  });
  const employees = filterOperationalEmployees(employeesRaw);

  const headerRow: (string | number)[] = ['ScopeId', 'Date', 'Day'];
  for (const e of employees) {
    headerRow.push(`${(e.empId ?? '').trim()} - ${(e.name ?? e.empId ?? '').trim()}`);
  }
  headerRow.push('TOTAL');

  const { keys: dayKeys } = getMonthRangeDayKeys(monthParam);
  const aoa: (string | number)[][] = [headerRow];
  for (const dateKey of dayKeys) {
    const date = new Date(dateKey + 'T12:00:00.000Z');
    const dayName = DAY_NAMES[date.getUTCDay()];
    const row: (string | number)[] = [scopeCode, dateKey, dayName];
    for (let i = 0; i < employees.length; i++) row.push('');
    row.push('');
    aoa.push(row);
  }

  const readme: unknown[][] = [
    ['MONTHLY MATRIX — branch-specific'],
    ['boutiqueId', boutique.id],
    ['ScopeId (column A) must be:', scopeCode],
    ['Upload: POST /api/sales/import/matrix (operational scope must match this boutique).'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), MATRIX_SHEET_NAME);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
