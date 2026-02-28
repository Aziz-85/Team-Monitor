import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { getCoverageSuggestion } from '@/lib/services/coverageSuggestion';
import { effectiveShiftFor } from '@/lib/services/shift';
import { assertScheduleEditable, ScheduleLockedError } from '@/lib/guards/scheduleLockGuard';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import type { Role } from '@prisma/client';

/**
 * POST /api/suggestions/coverage/apply
 * Body: { date: YYYY-MM-DD, empId: string }
 * Manager/Admin only. Creates a day-only ShiftOverride (AM → PM) and audit log.
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dateStr = String(body.date ?? '').trim();
  const empId = String(body.empId ?? '').trim();
  if (!dateStr || !empId) {
    return NextResponse.json({ error: 'date and empId required' }, { status: 400 });
  }
  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  try {
    await assertScheduleEditable({ dates: [dateStr], boutiqueId: scheduleScope.boutiqueId });
  } catch (e) {
    if (e instanceof ScheduleLockedError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  const date = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const { suggestion } = await getCoverageSuggestion(date);
  if (!suggestion) {
    return NextResponse.json(
      { error: 'No suggestion available for this date. Apply not allowed.' },
      { status: 400 }
    );
  }
  if (suggestion.empId !== empId) {
    return NextResponse.json(
      { error: 'This employee is not the suggested candidate for this date.' },
      { status: 400 }
    );
  }

  const beforeShift = await effectiveShiftFor(empId, date);
  const existing = await prisma.shiftOverride.findUnique({
    where: { empId_date: { empId, date } },
  });

  const toShift = suggestion.toShift;
  const reasonText = `${suggestion.fromShift} → ${suggestion.toShift}`;

  const created = await prisma.shiftOverride.upsert({
    where: { empId_date: { empId, date } },
    update: {
      overrideShift: toShift,
      reason: `Coverage suggestion: ${reasonText}`,
      isActive: true,
    },
    create: {
      empId,
      date,
      overrideShift: toShift,
      reason: `Coverage suggestion: ${reasonText}`,
      createdByUserId: user.id,
      isActive: true,
    },
  });
  clearCoverageValidationCache();

  await logAudit(
    user.id,
    'COVERAGE_SUGGESTION_APPLY',
    'ShiftOverride',
    created.id,
    JSON.stringify({ empId, date: dateStr, beforeShift, existing: existing ?? null }),
    JSON.stringify({ ...created, afterShift: toShift }),
    'Coverage suggestion applied',
    { module: 'SCHEDULE', targetEmployeeId: empId, targetDate: dateStr }
  );

  return NextResponse.json({
    ok: true,
    override: created,
    message: `Moved ${suggestion.employeeName} from ${suggestion.fromShift} to ${suggestion.toShift} for ${dateStr}.`,
  });
}
