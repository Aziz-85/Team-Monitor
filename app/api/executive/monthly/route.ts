/**
 * Monthly Board Report API — READ ONLY aggregation. MANAGER + ADMIN only.
 * Operational scope: single boutiqueId. All data filtered by boutiqueId + month (Asia/Riyadh).
 * Query: month (YYYY-MM). Optional; defaults to current month.
 * No cache so Daily Sales Ledger updates reflect immediately.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMonthRange, normalizeMonthKey } from '@/lib/time';
import { calculateBoutiqueScore } from '@/lib/executive/score';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }
  const operationalBoutiqueId = scope.boutiqueId;
  const boutiqueFilter = { boutiqueId: operationalBoutiqueId };

  const zoneIdsResult = await prisma.inventoryZone.findMany({
    where: boutiqueFilter,
    select: { id: true },
  });
  const zoneIds = zoneIdsResult.map((z) => z.id);

  const monthParam = request.nextUrl.searchParams.get('month');
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? normalizeMonthKey(monthParam)
      : new Date().toISOString().slice(0, 7);

  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);

  const [
    boutiqueTarget,
    salesAgg,
    ledgerLineCount,
    salesSample,
    employeeTargets,
    leaveCount,
    approvedLeaveCount,
    scheduleEditCount,
    taskCompletionsCount,
    zoneRunsCount,
    zoneCompletedCount,
    scoreResult,
    boutique,
  ] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, ...boutiqueFilter },
    }),
    prisma.salesEntry.aggregate({
      where: {
        ...boutiqueFilter,
        month: monthKey,
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.boutiqueSalesLine.count({
      where: {
        summary: {
          ...boutiqueFilter,
          date: { gte: monthStart, lt: monthEnd },
        },
      },
    }),
    prisma.salesEntry.findMany({
      where: {
        ...boutiqueFilter,
        month: monthKey,
        date: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, boutiqueId: true, date: true, amount: true },
      orderBy: { date: 'desc' },
      take: 3,
    }),
    prisma.employeeMonthlyTarget.findMany({
      where: { month: monthKey, ...boutiqueFilter },
      select: { userId: true, amount: true },
    }),
    prisma.leave.count({
      where: {
        status: 'PENDING',
        startDate: { lt: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.leave.count({
      where: {
        status: 'APPROVED',
        startDate: { lt: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.scheduleEditAudit.count({
      where: {
        editedAt: { gte: monthStart, lt: monthEnd },
        ...boutiqueFilter,
      },
    }),
    prisma.taskCompletion.count({
      where: {
        undoneAt: null,
        completedAt: { gte: monthStart, lt: monthEnd },
      },
    }),
    zoneIds.length > 0
      ? prisma.inventoryWeeklyZoneRun.count({
          where: {
            weekStart: { gte: monthStart, lt: monthEnd },
            zoneId: { in: zoneIds },
          },
        })
      : 0,
    zoneIds.length > 0
      ? prisma.inventoryWeeklyZoneRun.count({
          where: {
            weekStart: { gte: monthStart, lt: monthEnd },
            zoneId: { in: zoneIds },
            OR: [{ status: 'COMPLETED' }, { completedAt: { not: null } }],
          },
        })
      : 0,
    calculateBoutiqueScore(monthKey, [operationalBoutiqueId]),
    prisma.boutique.findUnique({
      where: { id: operationalBoutiqueId },
      select: { name: true, code: true },
    }),
  ]);

  const revenue = salesAgg._sum.amount ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const achievementPct = target > 0 ? Math.round((revenue / target) * 100) : 0;
  const totalEmployeeTarget = employeeTargets.reduce((s, e) => s + e.amount, 0);
  const zoneCompliancePct =
    zoneRunsCount > 0
      ? Math.round((zoneCompletedCount / zoneRunsCount) * 100)
      : 100;

  const salesEntryCount = salesAgg._count.id;

  return NextResponse.json({
    monthKey,
    dataScope: {
      boutiqueId: operationalBoutiqueId,
      boutiqueName: boutique?.name ?? null,
      boutiqueCode: boutique?.code ?? null,
      monthKey,
      salesEntryCount,
      ledgerLineCount,
      _debugSampleRows:
        process.env.NODE_ENV === 'development' && salesSample.length > 0
          ? salesSample.map((r) => ({
              id: r.id,
              boutiqueId: r.boutiqueId,
              date: r.date?.toISOString?.() ?? r.date,
              amount: r.amount,
            }))
          : undefined,
    },
    boutiqueScore: {
      score: scoreResult.score,
      classification: scoreResult.classification,
      components: scoreResult.components,
    },
    salesIntelligence: {
      revenue,
      target,
      achievementPct,
      totalEmployeeTarget,
      entryCount: salesAgg._count.id,
    },
    workforceStability: {
      pendingLeaves: leaveCount,
      approvedLeavesInPeriod: approvedLeaveCount,
      employeeTargetCount: employeeTargets.length,
    },
    operationalDiscipline: {
      taskCompletionsInMonth: taskCompletionsCount,
      scheduleEditsInMonth: scheduleEditCount,
      zoneRunsTotal: zoneRunsCount,
      zoneCompliancePct,
    },
    riskScore: {
      score: scoreResult.score,
      classification: scoreResult.classification,
    },
  });
}
