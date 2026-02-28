/**
 * Reads an MSR Excel file and prints:
 * - Detected empId columns count (headers that exactly match User.empId)
 * - First few rows with parsed dates
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/verify-import-empid.ts <path-to-xlsx> [monthKey YYYY-MM]
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { toRiyadhDateOnly } from '../lib/time';

const prisma = new PrismaClient();

const filePath = process.argv[2];
const monthKey = process.argv[3] || new Date().toISOString().slice(0, 7);
const inferYear = /^\d{4}-\d{2}$/.test(monthKey) ? parseInt(monthKey.slice(0, 4), 10) : new Date().getUTCFullYear();

function parseExcelDate(
  raw: unknown,
  inferYearVal: number
): { ok: true; date: Date } | { ok: false } {
  if (raw == null || raw === '') return { ok: false };
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return { ok: true, date: raw };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    try {
      const parsed = (XLSX.SSF as { parse_date_code?: (v: number) => { y: number; m: number; d: number } | null }).parse_date_code?.(raw);
      if (parsed && typeof parsed.y === 'number') {
        return {
          ok: true,
          date: new Date(Date.UTC(parsed.y, (parsed.m ?? 1) - 1, parsed.d ?? 1, 0, 0, 0, 0)),
        };
      }
    } catch {
      // fall through
    }
    const utc = (raw - 25569) * 86400 * 1000;
    if (Number.isFinite(utc)) return { ok: true, date: new Date(utc) };
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: true, date: new Date(s + 'T00:00:00.000Z') };
  }
  const shortMatch = s.match(/^(\d{1,2})[-/](\w+)$/i);
  if (shortMatch) {
    const d = parseInt(shortMatch[1], 10);
    const monStr = shortMatch[2].toLowerCase();
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const m = months[monStr];
    if (m !== undefined && d >= 1 && d <= 31) {
      return { ok: true, date: new Date(Date.UTC(inferYearVal, m, d, 0, 0, 0, 0)) };
    }
  }
  return { ok: false };
}

async function main() {
  if (!filePath) {
    console.log('Usage: scripts/verify-import-empid.ts <path-to-xlsx> [monthKey YYYY-MM]');
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    select: { empId: true },
  });
  const validEmpIds = new Set(users.map((u) => String(u.empId).trim()));

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const dataSheet = workbook.SheetNames.find((n) => n.toLowerCase() === 'data');
  const sheet = dataSheet ? workbook.Sheets[dataSheet] : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    console.log('No sheet found');
    process.exit(1);
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
  if (rows.length < 2) {
    console.log('Not enough rows');
    process.exit(1);
  }

  let headerIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const cells = (rows[r] as unknown[]).map((c) => String(c ?? '').toLowerCase());
    if (
      cells.some((c) => c.includes('quarter')) &&
      cells.some((c) => c.includes('date')) &&
      cells.some((c) => c.includes('total sale after'))
    ) {
      headerIndex = r;
      break;
    }
  }

  const header = (rows[headerIndex] as unknown[]).map((c) => String(c ?? '').trim());
  const totalSaleAfterCol = header.findIndex((h) => h.toLowerCase().includes('total sale after'));
  const dateCol = header.findIndex((h) => h.toLowerCase().includes('date'));

  const empIdColumns: string[] = [];
  for (let c = totalSaleAfterCol + 1; c < header.length; c++) {
    const label = header[c]?.trim() ?? '';
    if (!label) continue;
    if (validEmpIds.has(label)) empIdColumns.push(label);
  }

  console.log('File:', filePath);
  console.log('Infer year:', inferYear, '(from monthKey)', monthKey);
  console.log('Detected empId columns count:', empIdColumns.length);
  console.log('empId column headers:', empIdColumns.slice(0, 20).join(', ') + (empIdColumns.length > 20 ? '...' : ''));
  console.log('');

  if (dateCol >= 0) {
    console.log('First 5 data rows (parsed date):');
    for (let i = headerIndex + 1; i < Math.min(headerIndex + 6, rows.length); i++) {
      const row = rows[i] as unknown[];
      const dateRaw = row[dateCol];
      const parsed = parseExcelDate(dateRaw, inferYear);
      const dateStr = parsed.ok ? toRiyadhDateOnly(parsed.date).toISOString().slice(0, 10) : 'INVALID';
      console.log('  Row', i + 1, ':', dateStr);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
