/**
 * GET/POST /api/reports/schedule-export
 * Schedule Export Center — Excel download for week, date range, or month.
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

export const dynamic = 'force-dynamic';

function parseBool(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

type ExportParams = {
  type: ScheduleReportExportType;
  weekStart?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
  boutiqueId?: string;
  includeEmployeeSchedule: boolean;
  includeExternalCoverage: boolean;
  includeCoverageCounts: boolean;
  includeAudit: boolean;
  includeWarnings: boolean;
  includeSplitShifts: boolean;
};

function parseExportParams(source: URLSearchParams | Record<string, unknown>): ExportParams {
  const get = (key: string) => {
    if (source instanceof URLSearchParams) return source.get(key);
    const v = source[key];
    return typeof v === 'string' ? v : v != null ? String(v) : null;
  };

  const typeRaw = get('type')?.trim() ?? 'week';
  const type: ScheduleReportExportType =
    typeRaw === 'range' || typeRaw === 'month' ? typeRaw : 'week';

  return {
    type,
    weekStart: get('weekStart')?.trim() ?? undefined,
    startDate: get('startDate')?.trim() ?? undefined,
    endDate: get('endDate')?.trim() ?? undefined,
    month: get('month')?.trim() ?? undefined,
    boutiqueId: get('boutiqueId')?.trim() ?? undefined,
    includeEmployeeSchedule: parseBool(get('includeEmployeeSchedule'), true),
    includeExternalCoverage: parseBool(get('includeExternalCoverage'), true),
    includeCoverageCounts: parseBool(get('includeCoverageCounts'), true),
    includeAudit: parseBool(get('includeAudit'), true),
    includeWarnings: parseBool(get('includeWarnings'), true),
    includeSplitShifts: parseBool(get('includeSplitShifts'), true),
  };
}

async function handleExport(request: NextRequest, params: ExportParams) {
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

  const dateRange = resolveScheduleReportDateRange({
    type: params.type,
    weekStart: params.weekStart,
    startDate: params.startDate,
    endDate: params.endDate,
    month: params.month,
  });
  if ('error' in dateRange) {
    return NextResponse.json({ error: dateRange.error }, { status: 400 });
  }

  if (!canViewFullSchedule(user!.role)) {
    const weekForCheck =
      params.type === 'week' && params.weekStart
        ? params.weekStart
        : dateRange.startDate;
    const viewCheck = getScheduleEmployeeWeekVisibility(weekForCheck);
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
    params.boutiqueId
  );
  if ('error' in boutiqueResult) {
    return NextResponse.json({ error: boutiqueResult.error }, { status: 403 });
  }

  const empId = !canViewFullSchedule(user!.role) && user?.empId ? user.empId : undefined;
  const includeAudit =
    params.includeAudit && canExportScheduleAudit(user!.role) && !empId;

  try {
    const { buffer, startDate, endDate } = await buildScheduleReportExportWorkbook({
      type: params.type,
      weekStart: params.weekStart,
      startDate: params.startDate,
      endDate: params.endDate,
      month: params.month,
      boutiqueIds: boutiqueResult.boutiqueIds,
      boutiqueLabelsById: boutiqueResult.labelsById,
      empId,
      includeEmployeeSchedule: params.includeEmployeeSchedule,
      includeExternalCoverage: params.includeExternalCoverage,
      includeCoverageCounts: params.includeCoverageCounts,
      includeAudit,
      includeWarnings: params.includeWarnings,
      includeSplitShifts: params.includeSplitShifts,
    });

    const filename = `schedule-export-${startDate}-to-${endDate}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[reports/schedule-export]', err);
    const message = err instanceof Error ? err.message : 'Failed to generate export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const params = parseExportParams(request.nextUrl.searchParams);
  return handleExport(request, params);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const params = parseExportParams(body);
  return handleExport(request, params);
}
