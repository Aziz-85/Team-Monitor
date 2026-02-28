/**
 * Server-only YoY loader. Reads from /data/historical-excel/{branchCode}/{YYYY-MM}.xlsx.
 * No DB; read-only. Returns daily map or null if file missing.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';

export type YoYDayRow = {
  netSalesHalalas: number;
  invoices: number;
  pieces: number;
};

export type LoadYoYInput = {
  branchCode: string;
  month: string;
  year: number;
};

const DEFAULT_YOY_EXCEL_DIR = '/data/historical-excel';
const EXTENSIONS = ['.xlsx', '.xlsm'];

function getYoYExcelBaseDir(): string {
  return (process.env.YOY_EXCEL_DIR ?? DEFAULT_YOY_EXCEL_DIR).replace(/\/+$/, '');
}

function findCol(header: string[], ...candidates: string[]): number {
  const lower = header.map((h) => String(h ?? '').trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c) || c.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** Normalize to YYYY-MM-DD (Asia/Riyadh-friendly; Excel serial supported). */
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

/** SAR decimal → halalas int. If already large int, assume halalas. */
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

function safeBranchCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

/**
 * Load YoY reference from Excel.
 * Path: /data/historical-excel/{branchCode}/{YYYY-MM}.xlsx (convention).
 * Input month is "YYYY-MM" (e.g. "2024-01" for last year January).
 * Returns daily map keyed by YYYY-MM-DD; null if file missing.
 */
export async function loadYoYFromExcel(
  input: LoadYoYInput
): Promise<Map<string, YoYDayRow> | null> {
  const { branchCode, month } = input;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const safe = safeBranchCode(branchCode);
  const baseDir = getYoYExcelBaseDir();
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

  if (dateCol < 0 || netSalesCol < 0) return null;

  const dailyMap = new Map<string, YoYDayRow>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const dateStr = toDateStr(row[dateCol]);
    if (!dateStr) continue;
    const netSalesHalalas = toHalalas(row[netSalesCol]);
    const invoices = toInt(invCol >= 0 ? row[invCol] : 0);
    const pieces = toInt(piecesCol >= 0 ? row[piecesCol] : 0);

    const existing = dailyMap.get(dateStr);
    if (!existing) {
      dailyMap.set(dateStr, { netSalesHalalas, invoices, pieces });
    } else {
      existing.netSalesHalalas += netSalesHalalas;
      existing.invoices += invoices;
      existing.pieces += pieces;
    }
  }

  return dailyMap;
}
