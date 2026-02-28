/**
 * Executive Dashboard API — READ ONLY.
 * Returns aggregated data for /dashboard. RBAC applied: role determines what is returned.
 * Sales actuals: dashboard UI should use /api/sales/monthly-matrix (ledger) and merge; this API still returns targets + empId for merging.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import {
  getRiyadhNow,
  formatMonthKey,
  formatDateRiyadh,
  toRiyadhDateString,
  getMonthRange,
} from '@/lib/time';
import { getWeekStart, getWeekStatus } from '@/lib/services/scheduleLock';
import { resolveMetricsScope } from '@/lib/metrics/scope';
import { getDashboardSalesMetrics } from '@/lib/metrics/aggregator';
import { rosterForDate } from '@/lib/services/roster';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { getSLACutoffMs, computeInventoryStatus } from '@/lib/inventorySla';

const weekStartToDate = (weekStart: string): Date => new Date(weekStart + 'T00:00:00Z');
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import type { Role } from '@prisma/client';

const BURST_WINDOW_MS = 3 * 60 * 1000;
const BURST_MIN_TASKS = 4;

/** Target tables store SAR (int). API must return halalas for consistent UI formatting. */
const SAR_TO_HALALAS = 100;

function fridayOfWeek(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function getKsaWeekDates(todayStr: string): string[] {
  const d = new Date(todayStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day - 6 + 7) % 7;
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() - diff);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sat);
    x.setUTCDate(sat.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/** Count users with >= 1 burst (>= BURST_MIN_TASKS completions in BURST_WINDOW_MS). */
function countBursts(
  completions: { userId: string; completedAt: Date }[]
): { count: number; byUser: Map<string, number> } {
  const byUser = new Map<string, { completedAt: Date }[]>();
  for (const c of completions) {
    let list = byUser.get(c.userId);
    if (!list) {
      list = [];
      byUser.set(c.userId, list);
    }
    list.push({ completedAt: c.completedAt });
  }
  let totalBursts = 0;
  const burstCountByUser = new Map<string, number>();
  for (const [userId, list] of Array.from(byUser.entries())) {
    list.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    let userBursts = 0;
    for (let i = 0; i < list.length; i++) {
      const t0 = list[i].completedAt.getTime();
      const inWindow = list.filter(
        (t) => t.completedAt.getTime() >= t0 && t.completedAt.getTime() <= t0 + BURST_WINDOW_MS
      );
      if (inWindow.length >= BURST_MIN_TASKS) {
        userBursts++;
      }
    }
    if (userBursts > 0) {
      totalBursts += userBursts;
      burstCountByUser.set(userId, userBursts);
    }
  }
  return { count: totalBursts, byUser: burstCountByUser };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const monthKey = formatMonthKey(now);
  const weekStart = getWeekStart(now);
  const weekDates = getKsaWeekDates(todayStr);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T23:59:59.999Z');

  const metricsScope = await resolveMetricsScope(request);
  const boutiqueId = metricsScope?.effectiveBoutiqueId ?? '';
  const debugRequested =
    process.env.NODE_ENV === 'development' || request.nextUrl.searchParams.get('debug') === '1';

  const role = user.role as Role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isManager = role === 'MANAGER';
  const isEmployee = role === 'EMPLOYEE';
  const fullDashboard = isAdmin || isManager;
  const showAntiGaming = fullDashboard;
  const showPlannerSync = fullDashboard;

  const result: {
    rbac: { role: string; showAntiGaming: boolean; showPlannerSync: boolean; showFullDashboard: boolean };
    snapshot?: {
      sales?: { currentMonthTarget: number; currentMonthActual: number; completionPct: number; remainingGap: number };
      scheduleHealth?: {
        weekApproved: boolean;
        todayAmCount: number;
        todayPmCount: number;
        coverageViolationsCount: number;
      };
      taskControl?: {
        totalWeekly: number;
        completed: number;
        pending: number;
        overdue: number;
        zoneStatusSummary: string;
      };
      controlAlerts?: {
        suspiciousCount: number;
        leaveConflictsCount: number;
        unapprovedWeekWarning: boolean;
        lastPlannerSync: string | null;
      };
    };
    salesBreakdown?: { empId: string; name: string; target: number; actual: number; pct: number }[];
    scheduleOverview?: { amPmBalanceSummary: string; daysOverloaded: string[]; imbalanceHighlight: boolean };
    taskIntegrity?: { burstFlagsCount: number; sameDayBulkCount: number; top3SuspiciousUsers: string[] };
    teamTable?: {
      rows: {
        empId?: string;
        employee: string;
        role: string;
        position?: string | null;
        target: number;
        actual: number;
        pct: number;
        tasksDone: number;
        late: number;
        zone: string | null;
      }[];
    };
  } = {
    rbac: {
      role,
      showAntiGaming,
      showPlannerSync,
      showFullDashboard: fullDashboard,
    },
  };

  if (isEmployee) {
    const empId = user.empId;
    const [salesMetrics, rosterToday, tasks, myZoneRuns, weekStatus] = await Promise.all([
      getDashboardSalesMetrics({
        boutiqueId,
        userId: user.id,
        monthKey,
        employeeOnly: true,
      }),
      rosterForDate(now),
      prisma.task.findMany({
        where: { active: true, ...(boutiqueId ? { boutiqueId } : {}) },
        include: { taskSchedules: true, taskPlans: { include: { primary: true, backup1: true, backup2: true } } },
      }),
      prisma.inventoryWeeklyZoneRun.findMany({
        where: { weekStart: weekStartToDate(weekStart), empId },
        select: { status: true, completedAt: true, zone: { select: { code: true } } },
      }),
      getWeekStatus(weekStart, boutiqueId),
    ]);

    const myTarget = salesMetrics.currentMonthTarget;
    const myActual = salesMetrics.currentMonthActual;
    const completionPct = salesMetrics.completionPct;

    const todayTasks: { done: number; total: number } = { done: 0, total: 0 };
    const completionsToday = await prisma.taskCompletion.findMany({
      where: { userId: user.id, undoneAt: null, completedAt: { gte: new Date(todayStr + 'T00:00:00Z'), lte: new Date(todayStr + 'T23:59:59.999Z') } },
    });
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, now)) continue;
      const a = await assignTaskOnDate(task, now);
      if (a.assignedEmpId !== empId) continue;
      todayTasks.total++;
      if (completionsToday.some((c) => c.taskId === task.id)) todayTasks.done++;
    }

    const zoneCutoffMs = getSLACutoffMs(fridayOfWeek(weekStart));
    const zoneStatus =
      myZoneRuns.length > 0
        ? myZoneRuns
            .map((z) =>
              computeInventoryStatus({
                baseStatus: z.status,
                completedAt: z.completedAt,
                cutoffTimeMs: zoneCutoffMs,
              })
            )
            .join(', ')
        : '—';

    result.snapshot = {
      sales: {
        currentMonthTarget: myTarget,
        currentMonthActual: myActual,
        completionPct,
        remainingGap: salesMetrics.remainingGap,
      },
      scheduleHealth: {
        weekApproved: weekStatus?.status === 'APPROVED',
        todayAmCount: rosterToday.amEmployees.filter((e) => e.empId === empId).length ? 1 : 0,
        todayPmCount: rosterToday.pmEmployees.filter((e) => e.empId === empId).length ? 1 : 0,
        coverageViolationsCount: 0,
      },
      taskControl: {
        totalWeekly: todayTasks.total,
        completed: todayTasks.done,
        pending: todayTasks.total - todayTasks.done,
        overdue: 0,
        zoneStatusSummary: zoneStatus,
      },
      controlAlerts: {
        suspiciousCount: 0,
        leaveConflictsCount: 0,
        unapprovedWeekWarning: weekStatus?.status !== 'APPROVED',
        lastPlannerSync: null,
      },
    };
    result.salesBreakdown = [
      { empId, name: user.employee?.name ?? empId, target: myTarget, actual: myActual, pct: completionPct },
    ];
    const myZoneCode = myZoneRuns.length > 0 ? myZoneRuns[0].zone?.code ?? null : null;
    result.teamTable = {
      rows: [
        {
          empId,
          employee: user.employee?.name ?? empId,
          role: role,
          position: user.employee?.position ?? null,
          target: myTarget,
          actual: myActual,
          pct: completionPct,
          tasksDone: todayTasks.done,
          late: 0,
          zone: myZoneCode,
        },
      ],
    };
    return NextResponse.json(result);
  }

  // Sales: single source = aggregator; scope already from resolveMetricsScope.

  const [salesMetrics, empTargetsWithUser, rosterToday, coverageResults, weekStatus, tasks, plannerLast] =
    await Promise.all([
      boutiqueId
        ? getDashboardSalesMetrics({
            boutiqueId,
            userId: null,
            monthKey,
            employeeOnly: false,
          })
        : Promise.resolve({
            currentMonthTarget: 0,
            currentMonthActual: 0,
            completionPct: 0,
            remainingGap: 0,
            byUserId: {} as Record<string, number>,
          }),
      prisma.employeeMonthlyTarget.findMany({
        where: { month: monthKey, ...(boutiqueId ? { boutiqueId } : {}) },
        include: {
          user: {
            select: { id: true, empId: true, role: true, employee: { select: { name: true } } },
          },
        },
      }),
      rosterForDate(now, boutiqueId ? { boutiqueIds: [boutiqueId] } : {}),
      validateCoverage(now, boutiqueId ? { boutiqueIds: [boutiqueId] } : {}),
      getWeekStatus(weekStart, boutiqueId),
      prisma.task.findMany({
        where: { active: true, ...(boutiqueId ? { boutiqueId } : {}) },
        include: { taskSchedules: true, taskPlans: { include: { primary: true, backup1: true, backup2: true } } },
      }),
      showPlannerSync
        ? prisma.plannerImportBatch.findFirst({ orderBy: { uploadedAt: 'desc' }, select: { uploadedAt: true } })
        : Promise.resolve(null),
    ]);

  const currentMonthTarget = salesMetrics.currentMonthTarget;
  const currentMonthActual = salesMetrics.currentMonthActual;
  const completionPct = salesMetrics.completionPct;

  result.snapshot = {
    sales: {
      currentMonthTarget,
      currentMonthActual,
      completionPct,
      remainingGap: salesMetrics.remainingGap,
    },
    scheduleHealth: {
      weekApproved: weekStatus?.status === 'APPROVED',
      todayAmCount: rosterToday.amEmployees.length,
      todayPmCount: rosterToday.pmEmployees.length,
      coverageViolationsCount: coverageResults.length,
    },
    taskControl: undefined,
    controlAlerts: {
      suspiciousCount: 0,
      leaveConflictsCount: 0,
      unapprovedWeekWarning: weekStatus?.status !== 'APPROVED',
      lastPlannerSync: plannerLast?.uploadedAt ? plannerLast.uploadedAt.toISOString() : null,
    },
  };

  const salesByUser = salesMetrics.byUserId;
  result.salesBreakdown = empTargetsWithUser.map((et) => {
    const actual = salesByUser[et.userId] ?? 0;
    const targetHalalas = Math.round((et.amount ?? 0) * SAR_TO_HALALAS);
    const pct = targetHalalas > 0 ? Math.round((actual / targetHalalas) * 100) : 0;
    return {
      empId: et.user.empId,
      name: et.user.employee?.name ?? et.user.empId,
      target: targetHalalas,
      actual,
      pct,
    };
  });

  const taskIds = tasks.map((t) => t.id);
  const completionsInWeek =
    taskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: {
            taskId: { in: taskIds },
            undoneAt: null,
            completedAt: { gte: rangeStart, lte: rangeEnd },
          },
          select: { taskId: true, userId: true, completedAt: true },
        })
      : [];

  const allUsers = await prisma.user.findMany({
    where: { disabled: false },
    select: { id: true, empId: true },
  });
  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));

  let totalWeekly = 0;
  let completed = 0;
  let overdue = 0;
  for (const dateStr of weekDates) {
    const date = new Date(dateStr + 'T00:00:00Z');
    const isPast = dateStr < todayStr;
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      totalWeekly++;
      const assignedUserId = a.assignedEmpId ? empIdToUserId.get(a.assignedEmpId) : null;
      const comp = completionsInWeek.find(
        (c) => c.taskId === task.id && (assignedUserId ? c.userId === assignedUserId : false)
      );
      if (comp) completed++;
      else if (isPast) overdue++;
    }
  }
  const pending = totalWeekly - completed - overdue;
  if (result.snapshot) {
    result.snapshot.taskControl = {
      totalWeekly,
      completed,
      pending,
      overdue,
      zoneStatusSummary: '—',
    };
  }

  const zoneRunsExisting = await prisma.inventoryWeeklyZoneRun.findMany({
    where: { weekStart: weekStartToDate(weekStart), ...(boutiqueId ? { boutiqueId } : {}) },
    select: { status: true, completedAt: true },
  });
  const weekCutoffMs = getSLACutoffMs(fridayOfWeek(weekStart));
  let zonePending = 0;
  let zoneDone = 0;
  for (const z of zoneRunsExisting) {
    const eff = computeInventoryStatus({
      baseStatus: z.status,
      completedAt: z.completedAt,
      cutoffTimeMs: weekCutoffMs,
    });
    if (eff === 'PENDING' || eff === 'LATE') zonePending++;
    else zoneDone++;
  }
  if (result.snapshot?.taskControl) {
    result.snapshot.taskControl.zoneStatusSummary =
      zoneRunsExisting.length > 0 ? `${zoneDone} done, ${zonePending} pending` : '—';
  }

  const pendingLeaves = await prisma.leave.count({
    where: {
      status: 'PENDING',
      ...(boutiqueId ? { employee: { boutiqueId } } : {}),
    },
  });
  if (result.snapshot?.controlAlerts) {
    result.snapshot.controlAlerts.leaveConflictsCount = pendingLeaves;
  }

  if (showAntiGaming) {
    const burstResult = countBursts(completionsInWeek.map((c) => ({ userId: c.userId, completedAt: c.completedAt })));
    const userIds = Array.from(new Set(completionsInWeek.map((c) => c.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    });
    const userNames = Object.fromEntries(users.map((u) => [u.id, u.employee?.name ?? u.empId]));
    const top3 = Array.from(burstResult.byUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([uid]) => userNames[uid] ?? uid);

    if (result.snapshot?.controlAlerts) {
      result.snapshot.controlAlerts.suspiciousCount = burstResult.count;
    }
    result.taskIntegrity = {
      burstFlagsCount: burstResult.count,
      sameDayBulkCount: burstResult.count,
      top3SuspiciousUsers: top3,
    };
  }

  result.scheduleOverview = {
    amPmBalanceSummary: `AM ${rosterToday.amEmployees.length} / PM ${rosterToday.pmEmployees.length}`,
    daysOverloaded: coverageResults.map((v) => v.message),
    imbalanceHighlight: rosterToday.amEmployees.length > rosterToday.pmEmployees.length,
  };

  const employeesForTable = await prisma.employee.findMany({
    where: {
      active: true,
      isSystemOnly: false,
      ...notDisabledUserWhere,
      ...(boutiqueId ? { boutiqueId } : {}),
    },
    include: {
      user: { select: { id: true, empId: true, role: true } },
    },
    orderBy: employeeOrderByStable,
  });

  const empTargetMap = new Map(empTargetsWithUser.map((et) => [et.userId, et.amount]));
  const empSalesMap = salesMetrics.byUserId;
  const zoneAssignments = await prisma.inventoryZoneAssignment.findMany({
    where: { active: true, ...(boutiqueId ? { zone: { boutiqueId } } : {}) },
    orderBy: { createdAt: 'desc' },
    distinct: ['zoneId'],
    include: { zone: { select: { code: true } }, employee: { select: { empId: true } } },
  });
  const empIdToZone = new Map<string, string>();
  for (const a of zoneAssignments) {
    if (a.employee?.empId && !empIdToZone.has(a.employee.empId)) {
      empIdToZone.set(a.employee.empId, a.zone.code);
    }
  }

  const completionsByUser = new Map<string, number>();
  for (const c of completionsInWeek) {
    completionsByUser.set(c.userId, (completionsByUser.get(c.userId) ?? 0) + 1);
  }
  const lateByUser = new Map<string, number>();

  result.teamTable = {
    rows: employeesForTable
      .filter((e) => e.user)
      .map((e) => {
        const uid = e.user!.id;
        const targetSar = empTargetMap.get(uid) ?? 0;
        const targetHalalas = Math.round(targetSar * SAR_TO_HALALAS);
        const actual = empSalesMap[uid] ?? 0;
        const pct = targetHalalas > 0 ? Math.round((actual / targetHalalas) * 100) : 0;
        return {
          empId: e.empId,
          employee: e.name,
          role: e.user!.role,
          position: e.position ?? null,
          target: targetHalalas,
          actual,
          pct,
          tasksDone: completionsByUser.get(uid) ?? 0,
          late: lateByUser.get(uid) ?? 0,
          zone: empIdToZone.get(e.empId) ?? null,
        };
      })
      .sort((a, b) => b.pct - a.pct),
  };

  if (debugRequested && boutiqueId) {
    const { start: monthStart, endExclusive: monthEndExclusive } = getMonthRange(monthKey);
    const [salesEntryAgg, salesEntryByDateKey, ledgerSummaries, allUserEmpIds] = await Promise.all([
      prisma.salesEntry.aggregate({
        where: { month: monthKey, boutiqueId },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.salesEntry.groupBy({
        by: ['dateKey'],
        where: { month: monthKey, boutiqueId },
        _sum: { amount: true },
      }),
      prisma.boutiqueSalesSummary.findMany({
        where: {
          boutiqueId,
          date: { gte: monthStart, lt: monthEndExclusive },
        },
        include: { lines: true },
      }),
      prisma.user.findMany({ where: { disabled: false }, select: { empId: true } }).then((us) => new Set(us.map((u) => u.empId))),
    ]);
    const salesEntryCountMTD = salesEntryAgg._count.id;
    const salesEntrySumMTD = salesEntryAgg._sum.amount ?? 0;
    let ledgerLineCountMTD = 0;
    let ledgerLinesSumMTD = 0;
    let ledgerSummaryTotalMTD = 0;
    const ledgerSumByDateKey = new Map<string, number>();
    let unmappedLinesCount = 0;
    for (const s of ledgerSummaries) {
      const dateKey = formatDateRiyadh(s.date);
      let dayLineSum = 0;
      for (const line of s.lines) {
        ledgerLineCountMTD++;
        ledgerLinesSumMTD += line.amountSar;
        dayLineSum += line.amountSar;
        if (!allUserEmpIds.has(line.employeeId)) unmappedLinesCount++;
      }
      ledgerSumByDateKey.set(dateKey, (ledgerSumByDateKey.get(dateKey) ?? 0) + dayLineSum);
      ledgerSummaryTotalMTD += s.totalSar;
    }
    const salesEntryByDateKeyMap = new Map(
      salesEntryByDateKey.map((r) => [r.dateKey, r._sum.amount ?? 0])
    );
    const mismatchDates: string[] = [];
    for (const [dateKey, ledgerSum] of Array.from(ledgerSumByDateKey.entries())) {
      const entrySum = salesEntryByDateKeyMap.get(dateKey) ?? 0;
      if (Math.abs(entrySum - ledgerSum) > 0) mismatchDates.push(dateKey);
    }
    const mismatch = Math.abs(salesEntrySumMTD - ledgerLinesSumMTD) > 0;
    if (mismatch && process.env.NODE_ENV === 'development') {
      console.warn('[dashboard] SalesEntry vs Ledger MTD mismatch', {
        boutiqueId,
        monthKey,
        salesEntrySumMTD,
        ledgerLinesSumMTD,
        sampleMismatchDates: mismatchDates.slice(0, 10),
      });
    }
    (result as Record<string, unknown>).debug = {
      scope: { boutiqueId, monthKey },
      salesEntryCountMTD,
      salesEntrySumMTD,
      ledgerLineCountMTD,
      ledgerLinesSumMTD,
      ledgerSummaryTotalMTD,
      unmappedLinesCount,
      mismatch,
      mismatchDatesSample: mismatchDates.slice(0, 15),
    };
  }

  return NextResponse.json(result);
}
