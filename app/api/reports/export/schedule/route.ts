/**
 * GET/POST /api/reports/export/schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { canViewFullSchedule } from '@/lib/permissions';
import { getScheduleEmployeeWeekVisibility } from '@/lib/time';
import {
  resolveScheduleExportBoutiques,
  SCHEDULE_EXPORT_ROLES,
} from '@/lib/services/scheduleExportScope';
import {
  buildScheduleReportExportWorkbook,
  resolveScheduleReportDateRange,
  type ScheduleReportExportType,
} from '@/lib/services/scheduleReportExport';
import { canExportScheduleAudit } from '@/lib/services/scheduleFullExport';
import {
  excelDownloadResponse,
  getQueryString,
  parseQueryBool,
} from '@/lib/services/reportExportHandlers';
import { resolveSimpleDateRange } from '@/lib/services/reportExportCommon';

export const dynamic = 'force-dynamic';

async function handleExport(request: NextRequest, source: URLSearchParams | Record<string, unknown>) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(SCHEDULE_EXPORT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startDate = getQueryString(source, 'startDate');
  const endDate = getQueryString(source, 'endDate');
  const weekStart = getQueryString(source, 'weekStart');
  const month = getQueryString(source, 'month');
  const typeRaw = getQueryString(source, 'type') ?? 'range';
  const type: ScheduleReportExportType =
    typeRaw === 'week' || typeRaw === 'month' ? typeRaw : 'range';

  let dateRange = resolveScheduleReportDateRange({
    type,
    weekStart,
    startDate,
    endDate,
    month,
  });

  if ('error' in dateRange && type === 'range') {
    const simple = resolveSimpleDateRange(startDate, endDate);
    if ('error' in simple) {
      return NextResponse.json({ error: simple.error }, { status: 400 });
    }
    dateRange = simple;
  } else if ('error' in dateRange) {
    return NextResponse.json({ error: dateRange.error }, { status: 400 });
  }

  if (!canViewFullSchedule(user!.role)) {
    const viewCheck = getScheduleEmployeeWeekVisibility(dateRange.startDate);
    if (!viewCheck.allowed) {
      return NextResponse.json(
        { error: viewCheck.reason ?? 'This period is not in your allowed view range.' },
        { status: 403 }
      );
    }
  }

  const boutiqueResult = await resolveScheduleExportBoutiques(
    user!,
    request,
    getQueryString(source, 'boutiqueId')
  );
  if ('error' in boutiqueResult) {
    return NextResponse.json({ error: boutiqueResult.error }, { status: 403 });
  }

  const empId = !canViewFullSchedule(user!.role) && user?.empId ? user.empId : undefined;
  const includeAudit =
    parseQueryBool(source, 'includeAudit', true) &&
    canExportScheduleAudit(user!.role) &&
    !empId;

  try {
    const { buffer, startDate: outStart, endDate: outEnd } =
      await buildScheduleReportExportWorkbook({
        type: 'range',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        boutiqueIds: boutiqueResult.boutiqueIds,
        boutiqueLabelsById: boutiqueResult.labelsById,
        empId,
        includeEmployeeSchedule: parseQueryBool(source, 'includeEmployeeSchedule', true),
        includeExternalCoverage: parseQueryBool(source, 'includeExternalCoverage', true),
        includeCoverageCounts: parseQueryBool(source, 'includeCoverageCounts', true),
        includeAudit,
        includeWarnings: parseQueryBool(source, 'includeWarnings', true),
        includeSplitShifts: parseQueryBool(source, 'includeSplitShifts', true),
      });

    return excelDownloadResponse(
      buffer,
      `schedule-export-${outStart}-to-${outEnd}.xlsx`
    );
  } catch (err) {
    console.error('[reports/export/schedule]', err);
    const message = err instanceof Error ? err.message : 'Failed to generate export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleExport(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return handleExport(request, body);
}
