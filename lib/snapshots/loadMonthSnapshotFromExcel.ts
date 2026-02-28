/**
 * Server-only. Load current-month snapshot from Excel.
 * Path: {BASE_DIR}/{branchCode}/{YYYY-MM}.xlsx — same convention as YoY.
 * Does NOT write to DB; read-only.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';

const DEFAULT_MONTH_SNAPSHOT_DIR = '/data/month-snapshots';
const EXTENSIONS = ['.xlsx', '.xlsm'];

function getMonthSnapshotBaseDir(): string {
  return (process.env.MONTH_SNAPSHOT_DIR ?? DEFAULT_MONTH_SNAPSHOT_DIR).replace(/\/+$/, '');
}

export type MonthSnapshotDay = {
  date: string;
  netSalesHalalas: number;
  invoices: number;
  pieces: number;
};

export type MonthSnapshotStaffRow = {
  empId?: string;
  name: string;
  netSalesHalalas: number;
  invoices: number;
  pieces: number;
  achievementPct?: number;
};

export type MonthSnapshot = {
  month: string;
  branchCode: string;
  daily: MonthSnapshotDay[];
  staff: MonthSnapshotStaffRow[];
};

export type LoadMonthSnapshotInput = {
  branchCode: string;
  month: string;
};

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

function toHalalas(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  if (Number.isInteger(n) && n > 1e8) return n;
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

function safeBranchCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

/**
 * Load current-month snapshot from Excel.
 * Returns { month, branchCode, daily, staff } or null if file missing.
 */
export async function loadMonthSnapshotFromExcel(
  input: LoadMonthSnapshotInput
): Promise<MonthSnapshot | null> {
  const { branchCode, month } = input;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const safe = safeBranchCode(branchCode);
  const baseDir = getMonthSnapshotBaseDir();
  const dir = path.join(baseDir, safe);

  let buffer: Buffer | null = null;
  for (const ext of EXTENSIONS) {
    const filePath = path.join(dir, `${month}${ext}`);
    try {
      buffer = await readFile(filePath);
      break;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') continue;
      throw e;
    }
  }
  if (!buffer) return null;

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return null;
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) return null;

  const header = (rows[0] as unknown[]).map((c) => String(c ?? '').trim());
  const dateCol = findCol(header, 'date', 'day', 'تاريخ');
  const netSalesCol = findCol(header, 'netsales', 'net_sales', 'sales', 'amount', 'sar', 'ريال', 'مبيعات');
  const invCol = findCol(header, 'invoices', 'invoice', 'txn', 'transactions');
  const piecesCol = findCol(header, 'pieces', 'pcs', 'units', 'quantity');
  const empIdCol = findCol(header, 'empid', 'employee id', 'employeeid', 'id');
  const nameCol = findCol(header, 'name', 'employee', 'اسم');
  const achCol = findCol(header, 'achievement', 'achievementpct', 'target', 'ach');

  if (dateCol < 0 || netSalesCol < 0) return null;

  const byDate = new Map<string, { netSalesHalalas: number; invoices: number; pieces: number }>();
  const byStaff = new Map<
    string,
    { empId: string; name: string; netSalesHalalas: number; invoices: number; pieces: number; achSum: number; achCount: number }
  >();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const dateStr = toDateStr(row[dateCol]);
    if (!dateStr) continue;
    const netSalesHalalas = toHalalas(row[netSalesCol]);
    const invoices = toInt(invCol >= 0 ? row[invCol] : 0);
    const pieces = toInt(piecesCol >= 0 ? row[piecesCol] : 0);
    const empId = empIdCol >= 0 ? String(row[empIdCol] ?? '').trim() : '';
    const name = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
    const achievementPct = toPct(achCol >= 0 ? row[achCol] : 0);

    const day = byDate.get(dateStr);
    if (!day) {
      byDate.set(dateStr, { netSalesHalalas, invoices, pieces });
    } else {
      day.netSalesHalalas += netSalesHalalas;
      day.invoices += invoices;
      day.pieces += pieces;
    }

    if (empId || name) {
      const key = (empId || name || `row-${i}`).toLowerCase().trim();
      const cur = byStaff.get(key);
      if (!cur) {
        byStaff.set(key, {
          empId: empId || '',
          name: name || empId || `Staff ${key.slice(0, 8)}`,
          netSalesHalalas,
          invoices,
          pieces,
          achSum: achievementPct,
          achCount: 1,
        });
      } else {
        cur.netSalesHalalas += netSalesHalalas;
        cur.invoices += invoices;
        cur.pieces += pieces;
        cur.achSum += achievementPct;
        cur.achCount += 1;
      }
    }
  }

  const daily: MonthSnapshotDay[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      netSalesHalalas: d.netSalesHalalas,
      invoices: d.invoices,
      pieces: d.pieces,
    }));

  let staff: MonthSnapshotStaffRow[] = Array.from(byStaff.values()).map((s) => ({
    empId: s.empId || undefined,
    name: s.name,
    netSalesHalalas: s.netSalesHalalas,
    invoices: s.invoices,
    pieces: s.pieces,
    achievementPct: s.achCount > 0 ? s.achSum / s.achCount : undefined,
  }));

  const staffSheetName = workbook.SheetNames?.find((s) => String(s).trim().toLowerCase() === 'staff');
  if (staffSheetName) {
    const staffSheet = workbook.Sheets[staffSheetName];
    if (staffSheet) {
      const staffRows = XLSX.utils.sheet_to_json(staffSheet, { header: 1, defval: '' }) as unknown[][];
      if (staffRows.length >= 2) {
        const sh = (staffRows[0] as unknown[]).map((c) => String(c ?? '').trim());
        const empIdColS = findCol(sh, 'empid', 'emp id', 'employee id');
        const nameColS = findCol(sh, 'employeename', 'employee name', 'name', 'employee');
        const salesColS = findCol(sh, 'sales', 'netsales', 'net_sales');
        const invColS = findCol(sh, 'invoices');
        const piecesColS = findCol(sh, 'pieces');
        const targetColS = findCol(sh, 'target');
        if (empIdColS >= 0 || nameColS >= 0) {
          const fromSheet: MonthSnapshotStaffRow[] = [];
          for (let i = 1; i < staffRows.length; i++) {
            const row = staffRows[i] as unknown[];
            const empId = empIdColS >= 0 ? String(row[empIdColS] ?? '').trim() : '';
            const name = nameColS >= 0 ? String(row[nameColS] ?? '').trim() : '';
            if (!empId && !name) continue;
            const netSalesHalalas = salesColS >= 0 ? toHalalas(row[salesColS]) : 0;
            const inv = invColS >= 0 ? toInt(row[invColS]) : 0;
            const pcs = piecesColS >= 0 ? toInt(row[piecesColS]) : 0;
            const targetVal = targetColS >= 0 ? toHalalas(row[targetColS]) : 0;
            const achievementPct = targetVal > 0 ? Math.round((netSalesHalalas / targetVal) * 100) : undefined;
            fromSheet.push({
              empId: empId || undefined,
              name: name || empId || 'Staff',
              netSalesHalalas,
              invoices: inv,
              pieces: pcs,
              achievementPct,
            });
          }
          staff = fromSheet;
        }
      }
    }
  }

  return {
    month,
    branchCode,
    daily,
    staff,
  };
}
