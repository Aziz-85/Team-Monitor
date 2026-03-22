/**
 * Simple admin sales import template (Date, Email, Amount) — matches /api/admin/sales-import simple mode.
 */

import * as XLSX from 'xlsx';

const SHEET = 'Data';

export function buildSimpleSalesImportTemplate(meta: {
  boutiqueId: string;
  boutiqueCode: string | null;
  boutiqueName: string | null;
}): Buffer {
  const aoa: unknown[][] = [
    ['Date', 'Email', 'Amount'],
    ['YYYY-MM-DD', 'user@example.com', 0],
  ];
  const readme: unknown[][] = [
    ['SIMPLE SALES IMPORT — canonical SalesEntry via /api/admin/sales-import'],
    [],
    ['boutiqueId', meta.boutiqueId],
    ['boutiqueCode', meta.boutiqueCode ?? ''],
    ['boutiqueName', meta.boutiqueName ?? ''],
    [],
    ['Rules:'],
    ['- Sheet: first sheet or a sheet named "Data" (MSR mode uses different layout — see MSR docs).'],
    ['- Columns: date, email, amount (exact header names, case-insensitive match).'],
    ['- Email must match a user with employee email; boutique resolved from employee record.'],
    ['- Respects SalesEntry write precedence and locks (canonical upsert).'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
