import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getRiyadhNow,
  toRiyadhDateOnly,
  toRiyadhDateString,
  formatMonthKey,
  getMonthRange,
  getWeekRangeForDate,
  getDaysInMonth,
  intersectRanges,
  normalizeMonthKey,
} from '@/lib/time';

function getDailyTargetForDay(monthTarget: number, daysInMonth: number, dayOfMonth1Based: number): number {
  if (daysInMonth <= 0) return 0;
  const base = Math.floor(monthTarget / daysInMonth);
  const remainder = monthTarget - base * daysInMonth;
  return base + (dayOfMonth1Based <= remainder ? 1 : 0);
}
import {
  SALES_TARGET_ROLE_LABELS,
  getWeightForRole,
  getRoleWeightsFromDb,
  positionToSalesTargetRole,
  type SalesTargetRole,
} from '@/lib/sales-target-weights';
import {
  computeEmployeesTotal,
  computeDiff,
  getAllocationStatus,
} from '@/lib/targets/reconcile';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user?.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }
  const sessionBoutiqueId = user.boutiqueId;

  const monthKey =
    normalizeMonthKey(request.nextUrl.searchParams.get('month')?.trim() || formatMonthKey(getRiyadhNow()));

  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
  const daysInMonth = getDaysInMonth(monthKey);
  const todayStr = toRiyadhDateString(getRiyadhNow());
  const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(getRiyadhNow());
  const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);

  const [boutiqueTarget, employeeTargets, salesInMonth, todayEntries, weekEntriesByUser, roleWeights] =
    await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, boutiqueId: sessionBoutiqueId },
    }),
    prisma.employeeMonthlyTarget.findMany({
      where: { month: monthKey, boutiqueId: sessionBoutiqueId },
      include: {
        user: {
          include: {
            employee: {
              select: { empId: true, name: true, email: true, position: true, salesTargetRole: true, active: true },
            },
          },
        },
      },
    }),
    prisma.salesEntry.groupBy({
      by: ['userId'],
      where: { month: monthKey, boutiqueId: sessionBoutiqueId },
      _sum: { amount: true },
    }),
    prisma.salesEntry.findMany({
      where: {
        date: toRiyadhDateOnly(getRiyadhNow()),
        month: monthKey,
        boutiqueId: sessionBoutiqueId,
      },
      select: { userId: true, amount: true },
    }),
      weekInMonth
        ? prisma.salesEntry.groupBy({
            by: ['userId'],
            where: {
              date: { gte: weekInMonth.start, lt: weekInMonth.end },
              month: monthKey,
              boutiqueId: sessionBoutiqueId,
            },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      getRoleWeightsFromDb(prisma),
    ]);

  const mtdByUser = Object.fromEntries(salesInMonth.map((r) => [r.userId, r._sum.amount ?? 0]));
  const todayByUser = Object.fromEntries(todayEntries.map((e) => [e.userId, e.amount]));
  const weekByUser = Object.fromEntries(
    weekEntriesByUser.map((r) => [r.userId, r._sum.amount ?? 0])
  );

  const todayDateOnly = toRiyadhDateOnly(getRiyadhNow());
  const todayDayOfMonth = todayDateOnly.getUTCDate();

  const VALID_ROLES: SalesTargetRole[] = [
    'MANAGER',
    'ASSISTANT_MANAGER',
    'HIGH_JEWELLERY_EXPERT',
    'SENIOR_SALES_ADVISOR',
    'SALES_ADVISOR',
  ];

  const employees = employeeTargets.map((et) => {
    const monthlyTarget = et.amount;
    const todayTarget = daysInMonth > 0 ? getDailyTargetForDay(monthlyTarget, daysInMonth, todayDayOfMonth) : 0;
    let weekTarget = 0;
    if (weekInMonth && daysInMonth > 0) {
      const start = weekInMonth.start.getTime();
      const end = weekInMonth.end.getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      for (let t = start; t < end; t += dayMs) {
        weekTarget += getDailyTargetForDay(monthlyTarget, daysInMonth, new Date(t).getUTCDate());
      }
    }
    const mtdSales = mtdByUser[et.userId] ?? 0;
    const todaySales = todayByUser[et.userId] ?? 0;
    const weekSales = weekByUser[et.userId] ?? 0;
    const roleAtGen = (et.roleAtGeneration as SalesTargetRole) ?? null;
    const weightAtGen = et.weightAtGeneration ?? null;
    const currentRole =
      roleAtGen ??
      (et.user.employee?.salesTargetRole
        ? (et.user.employee.salesTargetRole as SalesTargetRole)
        : positionToSalesTargetRole(et.user.employee?.position ?? null));
    const weight = weightAtGen ?? getWeightForRole(currentRole, roleWeights);
    const roleLabel = SALES_TARGET_ROLE_LABELS[currentRole];
    const active = et.user.employee?.active ?? true;
    return {
      id: et.id,
      user: {
        id: et.user.id,
        empId: et.user.empId,
        name: et.user.employee?.name ?? et.user.empId,
        email: et.user.employee?.email ?? null,
      },
      role: currentRole,
      roleLabel,
      weight,
      active,
      scheduledDaysInMonth: et.scheduledDaysInMonth ?? null,
      leaveDaysInMonth: et.leaveDaysInMonth ?? null,
      presentDaysInMonth: et.presentDaysInMonth ?? null,
      presenceFactor: et.presenceFactor ?? null,
      effectiveWeightAtGeneration: et.effectiveWeightAtGeneration ?? null,
      distributionMethod: et.distributionMethod ?? null,
      monthlyTarget,
      mtdSales,
      mtdPct: monthlyTarget > 0 ? (mtdSales / monthlyTarget) * 100 : 0,
      todaySales,
      todayTarget,
      todayPct: todayTarget > 0 ? (todaySales / todayTarget) * 100 : 0,
      weekSales,
      weekTarget,
      weekPct: weekTarget > 0 ? (weekSales / weekTarget) * 100 : 0,
    };
  });

  const sumWeights = employees.reduce((s, e) => s + (e.effectiveWeightAtGeneration ?? e.weight), 0);
  const hasMissingRole = employees.some((e) => !e.role);
  const hasUnknownRole = employees.some((e) => e.role && !VALID_ROLES.includes(e.role));
  const zeroScheduledCount = employees.filter(
    (e) => e.scheduledDaysInMonth !== null && e.scheduledDaysInMonth === 0
  ).length;

  const boutiqueTargetSar = boutiqueTarget?.amount ?? 0;
  const employeesTotalSar = computeEmployeesTotal(employeeTargets);
  const diffSar = computeDiff(boutiqueTargetSar, employeesTotalSar);
  const status = getAllocationStatus(diffSar);

  const now = getRiyadhNow();
  const currentMonth = formatMonthKey(now);
  const dayOfMonth = now.getUTCDate();
  const targetEditRequiresReason = currentMonth === monthKey && dayOfMonth > 3;

  return NextResponse.json({
    month: monthKey,
    targetEditRequiresReason,
    boutiqueTarget: boutiqueTarget
      ? { id: boutiqueTarget.id, amount: boutiqueTarget.amount }
      : null,
    roleWeights,
    employees,
    todayStr,
    reconciliation: {
      boutiqueTargetSar,
      employeesTotalSar,
      diffSar,
      status,
    },
    warnings: {
      sumWeights,
      sumWeightsZero: employees.length > 0 && sumWeights === 0,
      hasMissingRole,
      hasUnknownRole,
      zeroScheduledCount,
      hasManyZeroScheduled: zeroScheduledCount > 0 && zeroScheduledCount >= employees.length / 2,
    },
  });
}
