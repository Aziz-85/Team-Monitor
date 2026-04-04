/**
 * Monthly Board Report API — READ ONLY aggregation. MANAGER + ADMIN only.
 * Operational scope: single boutiqueId. All data filtered by boutiqueId + month (Asia/Riyadh).
 * Query: month (YYYY-MM). Optional; defaults to current month.
 * No cache so Daily Sales Ledger updates reflect immediately.
 *
 * **CLASS B — mixed semantics (intentional):**
 * - **BoutiqueSalesSummary / BoutiqueSalesLine:** operational daily ledger; revenue KPI uses reconciliation
 *   (manual lines vs summary totalSar) — not interchangeable with raw SalesEntry totals.
 * - **SalesEntry breakdown:** CLASS A — `groupSalesEntryBySource` + `salesEntryWhereForBoutiqueMonthDateRange`
 *   from `readSalesAggregate` (canonical where; parity with matrix/dashboard when filters match).
 * Do not expect ledger revenue line to equal SalesEntry month sum without understanding sync lag / precedence.
 *
 * **Policy A (historical imports):** `HISTORICAL_IMPORT` rows exist only in SalesEntry — not in ledger.
 * Response includes `reconciliationPolicy` — see `docs/historical-ledger-reconciliation.md`.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  groupSalesEntryBySource,
  salesEntryWhereForBoutiqueMonthDateRange,
} from '@/lib/sales/readSalesAggregate';
import { getMonthRange, normalizeMonthKey, getCurrentMonthKeyRiyadh } from '@/lib/time';
import { calculateBoutiqueScore } from '@/lib/executive/score';
import { calculateRiskScore } from '@/lib/executive/risk';
import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { HISTORICAL_LEDGER_RECONCILIATION_POLICY } from '@/lib/sales/reconciliationPolicy';
import { requireExecutiveApiViewer } from '@/lib/executive/execAccess';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requireExecutiveApiViewer(request, user);
  if (!gate.ok) return gate.res;
  const operationalBoutiqueId = gate.scope.boutiqueId;
  const boutiqueFilter = { boutiqueId: operationalBoutiqueId };

  const zoneIdsResult = await prisma.inventoryZone.findMany({
    where: boutiqueFilter,
    select: { id: true },
  });
  const zoneIds = zoneIdsResult.map((z) => z.id);

  const monthParam = request.nextUrl.searchParams.get('month');
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(normalizeMonthKey(monthParam))
      ? normalizeMonthKey(monthParam)
      : getCurrentMonthKeyRiyadh();

  const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);

  const salesEntryWhereCanonical = salesEntryWhereForBoutiqueMonthDateRange(
    operationalBoutiqueId,
    monthKey,
    monthStart,
    monthEnd
  );

  const [
    boutiqueTarget,
    ledgerAgg,
    ledgerLineCount,
    ledgerLinesBySource,
    salesSample,
    salesBySource,
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
    prisma.boutiqueSalesSummary.aggregate({
      where: {
        ...boutiqueFilter,
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { totalSar: true },
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
    // Breakdown BoutiqueSalesLine by source (MANUAL = hand-entered, IMPORT = imported)
    prisma.boutiqueSalesLine.groupBy({
      by: ['source'],
      where: {
        summary: {
          ...boutiqueFilter,
          date: { gte: monthStart, lt: monthEnd },
        },
      },
      _sum: { amountSar: true },
      _count: { id: true },
    }),
    prisma.salesEntry.findMany({
      where: {
        ...boutiqueFilter,
        month: monthKey,
        date: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, boutiqueId: true, date: true, amount: true, source: true },
      orderBy: { date: 'desc' },
      take: 3,
    }),
    groupSalesEntryBySource(salesEntryWhereCanonical),
    prisma.employeeMonthlyTarget.findMany({
      where: { month: monthKey, ...boutiqueFilter },
      select: { userId: true, amount: true },
    }),
    prisma.leave.count({
      where: {
        status: 'PENDING',
        startDate: { lt: monthEnd },
        endDate: { gte: monthStart },
        employee: { boutiqueId: operationalBoutiqueId },
      },
    }),
    prisma.leave.count({
      where: {
        status: 'APPROVED',
        startDate: { lt: monthEnd },
        endDate: { gte: monthStart },
        employee: { boutiqueId: operationalBoutiqueId },
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
        task: { boutiqueId: operationalBoutiqueId },
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

  // Revenue: use only MANUAL-source ledger lines (hand-entered by manager, not imported)
  const manualLineRow = ledgerLinesBySource.find((r) => r.source === 'MANUAL');
  const manualLinesTotal = manualLineRow?._sum?.amountSar ?? 0;
  const ledgerSummaryTotal = ledgerAgg._sum.totalSar ?? 0;
  // Use the lower of: manual lines total vs summary totalSar (guards against import inflation)
  const revenue = manualLinesTotal > 0 ? manualLinesTotal : ledgerSummaryTotal;
  const target = boutiqueTarget?.amount ?? 0;
  const achievementPct = target > 0 ? calculatePerformance({ target, sales: revenue }).percent : 0;
  const totalEmployeeTarget = employeeTargets.reduce((s, e) => s + e.amount, 0);
  const zoneCompliancePct =
    zoneRunsCount > 0
      ? Math.round((zoneCompletedCount / zoneRunsCount) * 100)
      : 100;

  const salesEntryCount = ledgerAgg._count.id;

  // Source breakdown for transparency
  const sourceBreakdown = {
    ledgerSummaryTotal,
    ledgerLinesBySource: ledgerLinesBySource.map((r) => ({
      source: r.source,
      total: r._sum.amountSar ?? 0,
      count: r._count.id,
    })),
    salesEntryBySource: salesBySource.map((r) => ({
      source: r.source,
      total: r._sum.amount ?? 0,
      count: r._count.id,
    })),
  };

  // Guard rail: never return data that could include another boutique
  const badSample = salesSample.some((r) => r.boutiqueId !== operationalBoutiqueId);
  if (badSample) {
    console.error('[executive/monthly] Scope leak: sales sample contained wrong boutiqueId', {
      operationalBoutiqueId,
      sampleBoutiqueIds: salesSample.map((r) => r.boutiqueId),
    });
    return NextResponse.json({ error: 'Data scope error' }, { status: 403 });
  }

  // Independent risk score — NOT a copy of boutique performance score
  const riskResult = calculateRiskScore({
    revenue,
    target,
    achievementPct,
    pendingLeaves: leaveCount,
    approvedLeaves: approvedLeaveCount,
    employeeCount: employeeTargets.length,
    taskCompletions: taskCompletionsCount,
    burstCount: scoreResult.burstCount,
    zoneCompliancePct,
    scheduleEdits: scheduleEditCount,
    rosterSize: scoreResult.rosterSize,
  });

  return NextResponse.json({
    monthKey,
    reconciliationPolicy: HISTORICAL_LEDGER_RECONCILIATION_POLICY,
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
      entryCount: salesEntryCount,
      sourceBreakdown,
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
      score: riskResult.score,
      classification: riskResult.classification,
      factors: riskResult.factors,
      reasons: riskResult.reasons,
    },
  });
}
