import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  positionToSalesTargetRole,
  getWeightForRole,
  getRoleWeightsFromDb,
  type SalesTargetRole,
} from '@/lib/sales-target-weights';
import { logSalesTargetAudit } from '@/lib/sales-target-audit';
import { getPresenceForMonth } from '@/lib/sales-target-presence';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

const VALID_ROLES: SalesTargetRole[] = [
  'MANAGER',
  'ASSISTANT_MANAGER',
  'HIGH_JEWELLERY_EXPERT',
  'SENIOR_SALES_ADVISOR',
  'SALES_ADVISOR',
];

function effectiveRole(
  salesTargetRole: SalesTargetRole | null,
  position: import('@prisma/client').EmployeePosition | null
): SalesTargetRole {
  if (salesTargetRole && VALID_ROLES.includes(salesTargetRole)) return salesTargetRole;
  return positionToSalesTargetRole(position);
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { month?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const month = typeof body.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';

  if (!user.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }
  const sessionBoutiqueId = user.boutiqueId;
  const boutiqueTarget = await prisma.boutiqueMonthlyTarget.findFirst({
    where: { month, boutiqueId: sessionBoutiqueId },
  });
  if (!boutiqueTarget) {
    return NextResponse.json({ error: 'Boutique monthly target must be set first' }, { status: 400 });
  }

  const targetBoutiqueId = boutiqueTarget.boutiqueId;
  const employees = await prisma.employee.findMany({
    where: { active: true, isSystemOnly: false, boutiqueId: targetBoutiqueId },
    select: {
      empId: true,
      name: true,
      email: true,
      position: true,
      salesTargetRole: true,
    },
    orderBy: { empId: 'asc' },
  });

  const usersByEmpId = await prisma.user.findMany({
    where: { disabled: false, empId: { in: employees.map((e) => e.empId) } },
    select: { id: true, empId: true },
  });
  const empIdToUser = new Map<string, (typeof usersByEmpId)[0]>();
  for (const u of usersByEmpId) {
    empIdToUser.set(u.empId, u);
  }

  const empIdsWithUser = employees
    .filter((e) => empIdToUser.has(e.empId))
    .map((e) => e.empId);
  const [presenceMap, roleWeights] = await Promise.all([
    getPresenceForMonth(empIdsWithUser, month),
    getRoleWeightsFromDb(prisma),
  ]);

  type Row = {
    userId: string;
    empId: string;
    email: string | null;
    role: SalesTargetRole;
    roleWeight: number;
    scheduledDaysInMonth: number;
    leaveDaysInMonth: number;
    presentDaysInMonth: number;
    presenceFactor: number;
    effectiveWeight: number;
  };
  const rows: Row[] = [];
  for (const emp of employees) {
    const user = empIdToUser.get(emp.empId);
    if (!user) continue;
    const role = effectiveRole(emp.salesTargetRole, emp.position);
    const roleWeight = getWeightForRole(role, roleWeights);
    const presence = presenceMap.get(emp.empId) ?? {
      scheduledDaysInMonth: 0,
      leaveDaysInMonth: 0,
      presentDaysInMonth: 0,
      presenceFactor: 0,
    };
    const effectiveWeight = roleWeight * presence.presenceFactor;
    rows.push({
      userId: user.id,
      empId: emp.empId,
      email: emp.email ?? null,
      role,
      roleWeight,
      scheduledDaysInMonth: presence.scheduledDaysInMonth,
      leaveDaysInMonth: presence.leaveDaysInMonth,
      presentDaysInMonth: presence.presentDaysInMonth,
      presenceFactor: presence.presenceFactor,
      effectiveWeight,
    });
  }

  const sumEffectiveWeights = rows.reduce((s, r) => s + r.effectiveWeight, 0);
  if (sumEffectiveWeights <= 0) {
    return NextResponse.json(
      {
        error:
          'Sum of effective weights is zero. Ensure employees have scheduled days and valid roles; approved leave reduces effective weight.',
      },
      { status: 400 }
    );
  }

  const total = boutiqueTarget.amount;
  const amounts: { row: Row; amount: number }[] = [];
  let distributed = 0;
  for (const row of rows) {
    const raw = (total * row.effectiveWeight) / sumEffectiveWeights;
    const floored = Math.floor(raw);
    distributed += floored;
    amounts.push({ row, amount: floored });
  }
  const remainderInt = total - distributed;

  function compareEmpId(a: string, b: string): number {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  }
  amounts.sort((a, b) => {
    const c = compareEmpId(a.row.empId, b.row.empId);
    if (c !== 0) return c;
    return (a.row.email ?? '').localeCompare(b.row.email ?? '');
  });
  for (let i = 0; i < remainderInt && i < amounts.length; i++) {
    amounts[i].amount += 1;
  }

  const boutiqueId = boutiqueTarget.boutiqueId;
  const now = new Date();
  for (const { row, amount } of amounts) {
    await prisma.employeeMonthlyTarget.upsert({
      where: { boutiqueId_month_userId: { boutiqueId, month, userId: row.userId } },
      create: {
        boutiqueId,
        month,
        userId: row.userId,
        amount,
        sourceBoutiqueTargetId: boutiqueTarget.id,
        generatedAt: now,
        generatedById: user.id,
        roleAtGeneration: row.role,
        weightAtGeneration: row.roleWeight,
        scheduledDaysInMonth: row.scheduledDaysInMonth,
        leaveDaysInMonth: row.leaveDaysInMonth,
        presentDaysInMonth: row.presentDaysInMonth,
        presenceFactor: row.presenceFactor,
        effectiveWeightAtGeneration: row.effectiveWeight,
        distributionMethod: 'ROLE_WEIGHTED_LEAVE_ADJUSTED_V1',
      },
      update: regenerate
        ? {
            boutiqueId,
            amount,
            sourceBoutiqueTargetId: boutiqueTarget.id,
            generatedAt: now,
            generatedById: user.id,
            roleAtGeneration: row.role,
            weightAtGeneration: row.roleWeight,
            scheduledDaysInMonth: row.scheduledDaysInMonth,
            leaveDaysInMonth: row.leaveDaysInMonth,
            presentDaysInMonth: row.presentDaysInMonth,
            presenceFactor: row.presenceFactor,
            effectiveWeightAtGeneration: row.effectiveWeight,
            distributionMethod: 'ROLE_WEIGHTED_LEAVE_ADJUSTED_V1',
            updatedAt: now,
          }
        : {},
    });
  }

  await logSalesTargetAudit(month, regenerate ? 'REGENERATE' : 'GENERATE', user.id, {
    employeeCount: rows.length,
    sumEffectiveWeights,
    boutiqueAmount: total,
    distribution: 'role_weighted_leave_adjusted',
    roleWeights,
  }, { boutiqueId });

  return NextResponse.json({ ok: true, count: rows.length });
}
