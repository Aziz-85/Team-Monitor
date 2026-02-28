/**
 * Executive Dashboard API — READ ONLY, presentation aggregation.
 * MANAGER + ADMIN only. Scope resolved server-side; data filtered by boutiqueIds.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getRiyadhNow,
  formatMonthKey,
  toRiyadhDateString,
} from '@/lib/time';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { rosterForDate } from '@/lib/services/roster';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { calculateBoutiqueScore } from '@/lib/executive/score';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

const BURST_WINDOW_MS = 3 * 60 * 1000;
const BURST_MIN_TASKS = 4;

const weekStartToDate = (weekStart: string): Date =>
  new Date(weekStart + 'T00:00:00Z');

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

function countBursts(completions: { userId: string; completedAt: Date }[]): {
  count: number;
  byUser: Map<string, number>;
} {
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
        (t) =>
          t.completedAt.getTime() >= t0 &&
          t.completedAt.getTime() <= t0 + BURST_WINDOW_MS
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

/** Last N months keys (current first). */
function lastMonthKeys(today: Date, n: number): string[] {
  const keys: string[] = [];
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return keys;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await resolveScopeForUser(user.id, role, null);
  const boutiqueIds = scope.boutiqueIds;
  if (boutiqueIds.length === 0) {
    return NextResponse.json(
      { error: 'No boutiques in scope' },
      { status: 403 }
    );
  }

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const monthKey = formatMonthKey(now);
  const weekStart = getWeekStart(now);
  const weekDates = getKsaWeekDates(todayStr);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T23:59:59.999Z');

  const boutiqueFilter = { boutiqueId: { in: boutiqueIds } };
  const scopeZoneIds =
    boutiqueIds.length > 0
      ? (
          await prisma.inventoryZone.findMany({
            where: { boutiqueId: { in: boutiqueIds } },
            select: { id: true },
          })
        ).map((z) => z.id)
      : [];

  const [
    boutiqueTarget,
    salesCurrentMonth,
    salesByMonth,
    targetsByMonth,
    rosterToday,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for Promise.all order
    coverageResults,
    tasks,
    completionsInWeek,
    zoneRuns,
    scheduleEditAudits,
    allUsers,
  ] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, ...boutiqueFilter },
    }),
    prisma.salesEntry.aggregate({
      where: { month: monthKey, ...boutiqueFilter },
      _sum: { amount: true },
    }),
    prisma.salesEntry.groupBy({
      by: ['month'],
      where: boutiqueFilter,
      _sum: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: {
        month: { in: lastMonthKeys(now, 6) },
        ...boutiqueFilter,
      },
      select: { month: true, amount: true },
    }),
    rosterForDate(now),
    validateCoverage(now),
    prisma.task.findMany({
      where: { active: true, ...boutiqueFilter },
      include: {
        taskSchedules: true,
        taskPlans: {
          include: {
            primary: { select: { empId: true, name: true } },
            backup1: { select: { empId: true, name: true } },
            backup2: { select: { empId: true, name: true } },
          },
        },
      },
    }),
    prisma.taskCompletion.findMany({
      where: {
        undoneAt: null,
        completedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { taskId: true, userId: true, completedAt: true },
    }),
    scopeZoneIds.length > 0
      ? prisma.inventoryWeeklyZoneRun.findMany({
          where: {
            weekStart: weekStartToDate(weekStart),
            zoneId: { in: scopeZoneIds },
          },
          select: { zoneId: true, status: true, completedAt: true },
        })
      : [],
    prisma.scheduleEditAudit.findMany({
      where: boutiqueFilter,
      orderBy: { editedAt: 'desc' },
      take: 10,
      include: {
        editor: {
          select: {
            empId: true,
            employee: { select: { name: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { disabled: false },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    }),
  ]);

  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));
  const userIdToName = new Map(
    allUsers.map((u) => [u.id, u.employee?.name ?? u.empId])
  );

  const revenue = salesCurrentMonth._sum.amount ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const achievementPct = target > 0 ? Math.round((revenue / target) * 100) : 0;

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
      const assignedUserId = a.assignedEmpId
        ? empIdToUserId.get(a.assignedEmpId)
        : null;
      const comp = completionsInWeek.find(
        (c) =>
          c.taskId === task.id &&
          (assignedUserId ? c.userId === assignedUserId : false)
      );
      if (comp) completed++;
      else if (isPast) overdue++;
    }
  }
  const overdueTasksPct =
    totalWeekly > 0 ? Math.round((overdue / totalWeekly) * 100) : 0;

  const amCount = rosterToday.amEmployees.length;
  const pmCount = rosterToday.pmEmployees.length;
  const scheduleBalancePct =
    Math.max(amCount, pmCount) > 0
      ? Math.round(
          (Math.min(amCount, pmCount) / Math.max(amCount, pmCount)) * 100
        )
      : 100;

  const burstResult = countBursts(
    completionsInWeek.map((c) => ({ userId: c.userId, completedAt: c.completedAt }))
  );
  const suspiciousCount = burstResult.count;
  const suspiciousPct =
    totalWeekly > 0 ? Math.round((suspiciousCount / totalWeekly) * 100) : 0;

  const riskComponents = [
    Math.max(0, 100 - achievementPct) / 100,
    overdueTasksPct / 100,
    Math.min(1, suspiciousPct / 5),
  ];
  const riskIndex = Math.round(
    (riskComponents[0] * 0.4 + riskComponents[1] * 0.35 + riskComponents[2] * 0.25) *
      100
  );

  const prevMonthKey = lastMonthKeys(now, 2)[1];
  const prevMonthTarget = targetsByMonth.find((t) => t.month === prevMonthKey);
  const prevMonthSales = salesByMonth.find((s) => s.month === prevMonthKey);
  const prevRevenue = prevMonthSales?._sum.amount ?? 0;
  const revenueDelta =
    prevRevenue > 0
      ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100)
      : null;
  const targetDelta =
    prevMonthTarget && prevMonthTarget.amount > 0 && target > 0
      ? Math.round(((target - prevMonthTarget.amount) / prevMonthTarget.amount) * 100)
      : null;

  const monthKeys = lastMonthKeys(now, 6);
  const salesVsTargetTrend = monthKeys.map((m) => {
    const t = targetsByMonth.find((x) => x.month === m);
    const s = salesByMonth.find((x) => x.month === m);
    return {
      label: m,
      sales: s?._sum.amount ?? 0,
      target: t?.amount ?? 0,
    };
  }).reverse();

  const taskCompletionBreakdown = [
    { label: 'Completed', value: completed },
    { label: 'Pending', value: totalWeekly - completed - overdue },
    { label: 'Overdue', value: overdue },
  ];

  const zoneIds = zoneRuns
    .map((z) => z.zoneId)
    .filter((id, i, arr) => arr.indexOf(id) === i);
  const zones =
    zoneIds.length > 0
      ? await prisma.inventoryZone.findMany({
          where: { id: { in: zoneIds } },
          select: { id: true, code: true },
        })
      : [];
  const zoneCodeById = new Map(zones.map((z) => [z.id, z.code]));
  const zoneByCode = new Map<string, { done: number; total: number }>();
  for (const r of zoneRuns) {
    const code = zoneCodeById.get(r.zoneId) ?? r.zoneId;
    if (!zoneByCode.has(code)) zoneByCode.set(code, { done: 0, total: 0 });
    const z = zoneByCode.get(code)!;
    z.total++;
    if (r.status === 'COMPLETED' || r.completedAt != null) z.done++;
  }
  const zoneCompliance = Array.from(zoneByCode.entries())
    .map(([zone, v]) => ({
      zone,
      rate: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
    }))
    .sort((a, b) => a.zone.localeCompare(b.zone));

  const topPerformerByCompletions = new Map<string, number>();
  for (const c of completionsInWeek) {
    topPerformerByCompletions.set(
      c.userId,
      (topPerformerByCompletions.get(c.userId) ?? 0) + 1
    );
  }
  const topPerformerEntry = Array.from(topPerformerByCompletions.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const topPerformer = topPerformerEntry
    ? {
        name: userIdToName.get(topPerformerEntry[0]) ?? topPerformerEntry[0],
        completedCount: topPerformerEntry[1],
      }
    : null;

  const top3Suspicious = Array.from(burstResult.byUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([uid]) => userIdToName.get(uid) ?? uid);

  const showRiskPanel =
    overdueTasksPct > 10 ||
    suspiciousPct > 5 ||
    achievementPct < 80;

  let boutiqueScore: { score: number; classification: string; components?: Record<string, number> } = {
    score: 0,
    classification: '—',
  };
  try {
    const scoreResult = await calculateBoutiqueScore(monthKey, boutiqueIds);
    boutiqueScore = {
      score: scoreResult.score,
      classification: scoreResult.classification,
      components: scoreResult.components,
    };
  } catch {
    // leave default
  }

  return NextResponse.json({
    kpis: {
      revenue,
      target,
      achievementPct,
      overdueTasksPct,
      scheduleBalancePct,
      riskIndex,
      revenueDelta,
      targetDelta,
    },
    salesVsTargetTrend,
    taskCompletionBreakdown,
    zoneCompliance,
    antiGamingSummary: {
      burstCount: burstResult.count,
      sameDayBulkCount: burstResult.count,
      topSuspicious: top3Suspicious,
    },
    latestScheduleEdits: scheduleEditAudits.map((a) => ({
      id: a.id,
      weekStart: a.weekStart.toISOString().slice(0, 10),
      editedAt: a.editedAt.toISOString(),
      editorName: a.editor.employee?.name ?? a.editor.empId,
    })),
    topPerformer,
    showRiskPanel,
    boutiqueScore,
  });
}
