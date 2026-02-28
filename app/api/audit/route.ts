import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';

const SCHEDULE_ACTIONS = new Set([
  'WEEK_SAVE',
  'OVERRIDE_CREATED',
  'OVERRIDE_UPDATED',
  'OVERRIDE_DELETED',
  'COVERAGE_SUGGESTION_APPLY',
  'LOCK_DAY',
  'UNLOCK_DAY',
  'LOCK_WEEK',
  'UNLOCK_WEEK',
  'WEEK_APPROVED',
  'WEEK_UNAPPROVED',
]);

const INVENTORY_ACTIONS = new Set([
  'ZONE_COMPLETED',
  'WEEKLY_COMPLETE_ALL',
  'INVENTORY_DAILY_RECOMPUTE',
]);

const TEAM_ACTIONS = new Set(['TEAM_CHANGE_CREATED']);

const LOCK_ACTIONS = new Set(['LOCK_DAY', 'UNLOCK_DAY', 'LOCK_WEEK', 'UNLOCK_WEEK']);

const APPROVALS_ACTIONS = new Set(['APPROVAL_REQUEST_CREATED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED']);

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 100, 200);
  const moduleFilter = request.nextUrl.searchParams.get('module') ?? '';
  const weekStart = request.nextUrl.searchParams.get('weekStart') ?? '';
  const dateFrom = request.nextUrl.searchParams.get('from') ?? request.nextUrl.searchParams.get('dateFrom') ?? '';
  const dateTo = request.nextUrl.searchParams.get('to') ?? request.nextUrl.searchParams.get('dateTo') ?? '';
  const actorUserId = request.nextUrl.searchParams.get('actor') ?? request.nextUrl.searchParams.get('actorUserId') ?? '';
  const actionType = request.nextUrl.searchParams.get('actionType') ?? '';
  const employeeId = request.nextUrl.searchParams.get('employeeId') ?? request.nextUrl.searchParams.get('employee') ?? '';

  const conditions: object[] = [];

  // Filter by module
  if (moduleFilter) {
    conditions.push({ module: moduleFilter });
  } else {
    // Default: include all modules, but filter by action sets for backward compatibility
    const allActions = Array.from(SCHEDULE_ACTIONS)
      .concat(Array.from(INVENTORY_ACTIONS))
      .concat(Array.from(TEAM_ACTIONS))
      .concat(Array.from(LOCK_ACTIONS))
      .concat(Array.from(APPROVALS_ACTIONS));
    conditions.push({ action: { in: Array.from(new Set(allActions)) } });
  }

  // Filter by weekStart (using new weekStart field)
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    conditions.push({ weekStart: new Date(weekStart + 'T00:00:00Z') });
  }

  // Filter by date range (targetDate or createdAt)
  if (dateFrom && /^\d{4}-\d{2}-\d{2}/.test(dateFrom)) {
    conditions.push({
      OR: [
        { targetDate: { gte: new Date(dateFrom + 'T00:00:00Z') } },
        { createdAt: { gte: new Date(dateFrom + 'T00:00:00.000Z') } },
      ],
    });
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}/.test(dateTo)) {
    conditions.push({
      OR: [
        { targetDate: { lte: new Date(dateTo + 'T00:00:00Z') } },
        { createdAt: { lte: new Date(dateTo + 'T23:59:59.999Z') } },
      ],
    });
  }

  if (actorUserId) {
    conditions.push({ actorUserId });
  }
  if (actionType) {
    conditions.push({ action: actionType });
  }
  if (employeeId) {
    conditions.push({ targetEmployeeId: employeeId });
  }

  const where = conditions.length > 1 ? { AND: conditions } : conditions[0];

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actorUser: { select: { id: true, empId: true, role: true, employee: { select: { name: true } } } },
    },
  });

  // Get target employee names if needed
  const targetEmployeeIds = Array.from(new Set(logs.map((l) => l.targetEmployeeId).filter(Boolean) as string[]));
  const targetEmployees = await prisma.employee.findMany({
    where: { empId: { in: targetEmployeeIds } },
    select: { empId: true, name: true },
  });
  const employeeMap = new Map(targetEmployees.map((e) => [e.empId, e.name]));

  const items = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    module: log.module,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    targetEmployeeId: log.targetEmployeeId,
    targetEmployeeName: log.targetEmployeeId ? employeeMap.get(log.targetEmployeeId) ?? null : null,
    targetDate: log.targetDate ? log.targetDate.toISOString().slice(0, 10) : null,
    weekStart: log.weekStart ? log.weekStart.toISOString().slice(0, 10) : null,
    beforeJson: log.beforeJson,
    afterJson: log.afterJson,
    reason: log.reason,
    actor: log.actorUser
      ? {
          id: log.actorUser.id,
          empId: log.actorUser.empId,
          role: log.actorUser.role,
          name: log.actorUser.employee?.name ?? log.actorUser.empId,
        }
      : null,
  }));

  return NextResponse.json({ items });
}
