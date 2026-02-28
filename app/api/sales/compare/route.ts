/**
 * POST /api/sales/compare — File vs DB reconciliation.
 * Multipart: file, scopeId (optional, use operational), month (YYYY-MM), includePreviousMonth (true|false), mode (matrix|msr).
 * Returns fileSummary, dbSummary, missingInDb, extraInDb, mismatch.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import {
  parseMatrixTemplateExcel,
  extractEmpIdFromHeader,
  normalizeForMatch,
} from '@/lib/sales/parseMatrixTemplateExcel';
import {
  parseOneMonthlySheet,
  sheetNameFromMonth,
  previousMonthKey,
  loadEmployeesMapWithIds,
  normalizeCell,
} from '@/lib/sales/parseMonthlySheetExcel';
import { getMonthRange } from '@/lib/time';
import { formatDateRiyadh } from '@/lib/time';
import { normalizeMonthKey } from '@/lib/time';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER'] as const;

function norm(h: string): string {
  return normalizeForMatch(h);
}

function resolveHeaderToEmployeeMatrix(
  headerRaw: string,
  employees: { empId: string; name: string | null }[]
): string | null {
  const empIdFromHeader = extractEmpIdFromHeader(headerRaw);
  if (empIdFromHeader) {
    const e = employees.find((x) => (x.empId ?? '').trim().toLowerCase() === empIdFromHeader.toLowerCase());
    if (e) return e.empId;
  }
  const h = norm(headerRaw);
  if (!h) return null;
  for (const e of employees) {
    const name = (e.name ?? '').trim();
    const n = norm(name);
    const first = (n.split(/\s+/)[0] ?? '').trim();
    const noSpace = n.replace(/\s+/g, '');
    const headerNoSpace = h.replace(/\s+/g, '');
    if (n && h === n) return e.empId;
    if (first && h === first) return e.empId;
    if (noSpace && headerNoSpace === noSpace) return e.empId;
    if (n && n.includes(h)) return e.empId;
  }
  return null;
}

function resolveHeaderToEmployeeMsr(
  header: string,
  workbookMap: Map<string, string>,
  employees: { empId: string; name: string | null }[]
): string | null {
  const h = normalizeCell(header);
  if (!h) return null;
  const empIdFromWorkbook = workbookMap.get(h);
  if (empIdFromWorkbook) {
    const e = employees.find((x) => (x.empId ?? '').trim() === empIdFromWorkbook);
    if (e) return e.empId;
  }
  const headerNoSpace = h.replace(/\s+/g, '');
  for (const e of employees) {
    const name = (e.name ?? '').trim();
    const n = normalizeCell(name);
    const first = (n.split(/\s+/)[0] ?? '').trim();
    const noSpace = n.replace(/\s+/g, '');
    if (n && h === n) return e.empId;
    if (first && h === first) return e.empId;
    if (noSpace && headerNoSpace === noSpace) return e.empId;
    if (n && n.includes(h)) return e.empId;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const scopeId = scopeResult.boutiqueId;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const monthParam = (formData.get('month') as string)?.trim() ?? '';
  const includePreviousMonth = (formData.get('includePreviousMonth') as string)?.toLowerCase() === 'true';
  const mode = ((formData.get('mode') as string) ?? 'matrix').toLowerCase();

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  if (mode !== 'matrix' && mode !== 'msr') {
    return NextResponse.json({ error: 'mode must be matrix or msr' }, { status: 400 });
  }

  const month = normalizeMonthKey(monthParam);
  const { start: monthStart, endExclusive } = getMonthRange(month);
  let rangeStart = monthStart;
  const rangeEnd = new Date(endExclusive.getTime());
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() - 1);
  if (includePreviousMonth) {
    const prev = previousMonthKey(month);
    if (prev) {
      const { start: prevStart } = getMonthRange(prev);
      rangeStart = prevStart;
    }
  }

  const employees = await prisma.employee.findMany({
    where: { boutiqueId: scopeId },
    select: { empId: true, name: true },
  });
  const empNameById = new Map(employees.map((e) => [e.empId, (e.name ?? '').trim() || e.empId]));

  const fileMap = new Map<string, number>();
  const employeesDetected = new Set<string>();
  let parsedCellsCount = 0;
  let parsedTotalSar = 0;
  const notes: string[] = [];

  const buf = Buffer.from(await file.arrayBuffer());

  if (mode === 'matrix') {
    const parseResult = parseMatrixTemplateExcel(buf);
    if (!parseResult.ok) {
      return NextResponse.json({
        scopeId,
        month,
        includePreviousMonth,
        mode,
        error: parseResult.error,
        notes: ['Parse failed'],
      }, { status: 400 });
    }
    const headerToEmpId = new Map<string, string>();
    for (const col of parseResult.employeeColumns) {
      const empId = resolveHeaderToEmployeeMatrix(col.headerRaw, employees);
      if (empId) headerToEmpId.set(norm(col.headerRaw), empId);
    }
    const allowedDateSet = new Set<string>();
    for (let d = new Date(rangeStart.getTime()); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      allowedDateSet.add(d.toISOString().slice(0, 10));
    }
    for (const row of parseResult.rows) {
      if (row.scopeId !== scopeId) continue;
      if (!allowedDateSet.has(row.dateKey)) continue;
      for (const v of row.values) {
        const empId = headerToEmpId.get(norm(v.headerRaw)) ?? resolveHeaderToEmployeeMatrix(v.headerRaw, employees);
        if (!empId) continue;
        const key = `${row.dateKey}::${empId}`;
        fileMap.set(key, v.amountSar);
        employeesDetected.add(empId);
        parsedCellsCount += 1;
        parsedTotalSar += v.amountSar;
      }
    }
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
    } catch {
      return NextResponse.json({
        scopeId,
        month,
        mode,
        error: 'Invalid Excel file',
        notes: [],
      }, { status: 400 });
    }
    const workbookMap = loadEmployeesMapWithIds(workbook);
    const sheetsToParse: { sheetName: string; monthKey: string }[] = [
      { sheetName: sheetNameFromMonth(month), monthKey: month },
    ];
    if (includePreviousMonth) {
      const prev = previousMonthKey(month);
      if (prev) sheetsToParse.push({ sheetName: sheetNameFromMonth(prev), monthKey: prev });
    }
    const allowedDateSet = new Set<string>();
    for (let d = new Date(rangeStart.getTime()); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      allowedDateSet.add(d.toISOString().slice(0, 10));
    }
    for (const { sheetName, monthKey } of sheetsToParse) {
      if (!sheetName) continue;
      const parsed = parseOneMonthlySheet(workbook, sheetName, monthKey);
      if (!parsed.ok) {
        notes.push(`Sheet ${sheetName}: ${parsed.error}`);
        continue;
      }
      for (const row of parsed.rows) {
        if (!allowedDateSet.has(row.dateKey)) continue;
        for (const v of row.values) {
          const empId = resolveHeaderToEmployeeMsr(v.columnHeader, workbookMap, employees);
          if (!empId) continue;
          const key = `${row.dateKey}::${empId}`;
          fileMap.set(key, v.amountSar);
          employeesDetected.add(empId);
          parsedCellsCount += 1;
          parsedTotalSar += v.amountSar;
        }
      }
    }
  }

  const summaries = await prisma.boutiqueSalesSummary.findMany({
    where: {
      boutiqueId: scopeId,
      date: { gte: rangeStart, lte: rangeEnd },
    },
    include: { lines: { select: { employeeId: true, amountSar: true } } },
  });

  const keySep = '::';
  const dbMap = new Map<string, number>();
  for (const s of summaries) {
    const dateKey = formatDateRiyadh(s.date);
    for (const line of s.lines) {
      dbMap.set(`${dateKey}${keySep}${line.employeeId}`, line.amountSar);
    }
  }

  const missingInDb: { date: string; employeeId: string; employeeName: string; fileSar: number }[] = [];
  const extraInDb: { date: string; employeeId: string; employeeName: string; dbSar: number }[] = [];
  const mismatch: { date: string; employeeId: string; employeeName: string; fileSar: number; dbSar: number; diff: number }[] = [];

  for (const [key, fileSar] of Array.from(fileMap)) {
    const idx = key.indexOf(keySep);
    const date = idx >= 0 ? key.slice(0, idx) : key;
    const employeeId = idx >= 0 ? key.slice(idx + keySep.length) : '';
    const dbSar = dbMap.get(key);
    const employeeName = empNameById.get(employeeId) ?? employeeId;
    if (dbSar === undefined) {
      missingInDb.push({ date, employeeId, employeeName, fileSar });
    } else if (dbSar !== fileSar) {
      mismatch.push({
        date,
        employeeId,
        employeeName,
        fileSar,
        dbSar,
        diff: fileSar - dbSar,
      });
    }
  }
  for (const [key, dbSar] of Array.from(dbMap)) {
    if (fileMap.has(key)) continue;
    const idx = key.indexOf(keySep);
    const date = idx >= 0 ? key.slice(0, idx) : key;
    const employeeId = idx >= 0 ? key.slice(idx + keySep.length) : '';
    const employeeName = empNameById.get(employeeId) ?? employeeId;
    extraInDb.push({ date, employeeId, employeeName, dbSar });
  }

  const recordsCount = dbMap.size;
  const dbTotalSar = Array.from(dbMap.values()).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    scopeId,
    month,
    includePreviousMonth,
    mode,
    fileSummary: {
      parsedCellsCount,
      parsedTotalSar,
      employeesDetected: Array.from(employeesDetected),
    },
    dbSummary: {
      recordsCount,
      totalSar: dbTotalSar,
    },
    missingInDb,
    extraInDb,
    mismatch,
    notes,
  });
}
