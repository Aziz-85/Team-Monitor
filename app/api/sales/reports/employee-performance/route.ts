/**
 * GET /api/sales/reports/employee-performance?month=YYYY-MM
 * GET /api/sales/reports/employee-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';
import {
  buildEmployeePerformanceReport,
  dateRangeForMonth,
} from '@/lib/sales/employeePerformanceReport';
import { normalizeMonthKey } from '@/lib/time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { boutiqueId } = auth.scope;

  const month = request.nextUrl.searchParams.get('month')?.trim();
  const from = request.nextUrl.searchParams.get('from')?.trim();
  const to = request.nextUrl.searchParams.get('to')?.trim();

  let fromDateKey: string;
  let toDateKey: string;

  if (month) {
    const norm = normalizeMonthKey(month);
    const range = dateRangeForMonth(norm);
    fromDateKey = range.from;
    toDateKey = range.to;
  } else if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    fromDateKey = from;
    toDateKey = to;
  } else {
    return NextResponse.json(
      { error: 'Provide month=YYYY-MM or from=YYYY-MM-DD&to=YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const employees = await buildEmployeePerformanceReport({
    fromDateKey,
    toDateKey,
    boutiqueIds: [boutiqueId],
  });

  return NextResponse.json({
    fromDateKey,
    toDateKey,
    boutiqueId,
    employees,
  });
}
