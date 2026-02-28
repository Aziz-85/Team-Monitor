/**
 * Parse Excel/CSV into HistoricalSnapshot shape.
 * - netSales stored as int halalas (1 SAR = 100 halalas).
 * - achievementPct float 0..100; missing employee fields default to 0.
 */

import * as XLSX from 'xlsx';
import type { HistoricalSnapshot, HistoricalSnapshotDay, HistoricalSnapshotEmployee } from './types';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function findCol(header: string[], ...candidates: string[]): number {
  const lower = header.map((h) => String(h ?? '').trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c) || c.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
    return null;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) {
    const d = new Date((v - 25569) * 86400 * 1000);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return null;
}

/** Parse number; assume Excel has SAR → convert to halalas (1 SAR = 100 halalas). */
function toHalalas(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function toInt(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : Math.round(n);
}

function toPct(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function parseSheetToSnapshot(
  rows: unknown[][],
  month: string,
  boutiqueId: string
): HistoricalSnapshot | { error: string } {
  if (!MONTH_REGEX.test(month)) return { error: 'Invalid month (use YYYY-MM)' };
  if (rows.length < 2) return { error: 'Need header row and at least one data row' };

  const header = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
  const dateCol = findCol(header, 'date', 'day', 'تاريخ');
  const netSalesCol = findCol(header, 'netsales', 'net_sales', 'sales', 'amount', 'sar', 'ريال', 'مبيعات');
  const invCol = findCol(header, 'invoices', 'invoice', 'txn', 'transactions');
  const piecesCol = findCol(header, 'pieces', 'pcs', 'units', 'quantity');
  const empIdCol = findCol(header, 'empid', 'employee id', 'employeeid', 'id');
  const nameCol = findCol(header, 'name', 'employee', 'اسم');
  const achCol = findCol(header, 'achievement', 'achievementpct', 'target', 'ach');

  if (dateCol < 0) return { error: 'Missing date column' };
  if (netSalesCol < 0) return { error: 'Missing net sales / amount column' };

  const byDate = new Map<string, { netSales: number; invoices: number; pieces: number; employees: HistoricalSnapshotEmployee[] }>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const dateStr = toDateStr(row[dateCol]);
    if (!dateStr) continue;
    const netSales = toHalalas(row[netSalesCol]);
    const invoices = toInt(invCol >= 0 ? row[invCol] : 0);
    const pieces = toInt(piecesCol >= 0 ? row[piecesCol] : 0);
    const empId = empIdCol >= 0 ? String(row[empIdCol] ?? '').trim() : '';
    const name = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
    const achievementPct = toPct(achCol >= 0 ? row[achCol] : 0);

    let day = byDate.get(dateStr);
    if (!day) {
      day = { netSales: 0, invoices: 0, pieces: 0, employees: [] };
      byDate.set(dateStr, day);
    }
    day.netSales += netSales;
    day.invoices += invoices;
    day.pieces += pieces;
    if (empId || name) {
      day.employees.push({
        empId: empId || `row-${i + 1}`,
        name: name || '',
        netSales,
        invoices,
        pieces,
        achievementPct,
      });
    }
  }

  const daily: HistoricalSnapshotDay[] = [];
  let totNet = 0;
  let totInv = 0;
  let totPcs = 0;
  const sortedDates = Array.from(byDate.keys()).sort();
  for (const date of sortedDates) {
    const d = byDate.get(date)!;
    daily.push({
      date,
      netSales: d.netSales,
      invoices: d.invoices,
      pieces: d.pieces,
      employees: d.employees,
    });
    totNet += d.netSales;
    totInv += d.invoices;
    totPcs += d.pieces;
  }

  return {
    month,
    boutiqueId,
    daily,
    totals: { netSales: totNet, invoices: totInv, pieces: totPcs },
  };
}

export function parseExcelBuffer(buffer: Buffer, month: string, boutiqueId: string): HistoricalSnapshot | { error: string } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { error: 'Invalid Excel file' };
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { error: 'No sheet found' };
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  return parseSheetToSnapshot(rows, month, boutiqueId);
}

/** Parse CSV text (no new deps: split lines and commas). */
export function parseCsvText(csvText: string, month: string, boutiqueId: string): HistoricalSnapshot | { error: string } {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { error: 'CSV must have header and at least one row' };
  const rows = lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' && !inQuotes) || c === '\t') {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  }) as unknown[][];
  return parseSheetToSnapshot(rows, month, boutiqueId);
}
