/**
 * GET/POST /api/reports/export/tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import {
  resolveScheduleExportBoutiques,
  SCHEDULE_EXPORT_ROLES,
} from '@/lib/services/scheduleExportScope';
import { buildTasksReportExportWorkbook } from '@/lib/services/tasksReportExport';
import {
  excelDownloadResponse,
  getQueryString,
  parseQueryBool,
} from '@/lib/services/reportExportHandlers';
import { resolveSimpleDateRange } from '@/lib/services/reportExportCommon';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TASKS_EXPORT_ROLES: Role[] = [
  ...SCHEDULE_EXPORT_ROLES,
];

async function handleExport(request: NextRequest, source: URLSearchParams | Record<string, unknown>) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(TASKS_EXPORT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const range = resolveSimpleDateRange(
    getQueryString(source, 'startDate'),
    getQueryString(source, 'endDate')
  );
  if ('error' in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const boutiqueResult = await resolveScheduleExportBoutiques(
    user!,
    request,
    getQueryString(source, 'boutiqueId')
  );
  if ('error' in boutiqueResult) {
    return NextResponse.json({ error: boutiqueResult.error }, { status: 403 });
  }

  const isEmployee = user!.role === 'EMPLOYEE';
  const empIdFilter = isEmployee && user?.empId ? user.empId : undefined;

  try {
    const { buffer, startDate, endDate } = await buildTasksReportExportWorkbook({
      startDate: range.startDate,
      endDate: range.endDate,
      boutiqueIds: boutiqueResult.boutiqueIds,
      boutiqueLabelsById: boutiqueResult.labelsById,
      empIdFilter,
      includeSummary: parseQueryBool(source, 'includeSummary', true),
      includeTaskList: parseQueryBool(source, 'includeTaskList', true),
      includeOverdue: parseQueryBool(source, 'includeOverdue', true),
      includeCompleted: parseQueryBool(source, 'includeCompleted', true),
      includeEmployeePerformance: parseQueryBool(source, 'includeEmployeePerformance', true),
    });

    return excelDownloadResponse(buffer, `tasks-export-${startDate}-to-${endDate}.xlsx`);
  } catch (err) {
    console.error('[reports/export/tasks]', err);
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
