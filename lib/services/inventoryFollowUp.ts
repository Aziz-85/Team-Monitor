import { prisma } from '@/lib/db';
import { getOrCreateDailyRun, getProjectedAssignee } from '@/lib/services/inventoryDaily';
import { getWeeklyRuns } from '@/lib/services/inventoryZones';
import { getSLACutoffMs, computeInventoryStatus } from '@/lib/inventorySla';

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseDate(s: string): Date {
  return new Date(s + 'T12:00:00Z');
}

export type DailyFollowUpDay = {
  date: string;
  status: string;
  effectiveStatus: string;
  assignedEmpId: string | null;
  assignedName: string | null;
  completedByEmpId: string | null;
  completedByName: string | null;
  completedAt: Date | null;
  reason: string | null;
  skipCount: number;
  skipSummary: Array<{ empId: string; name: string; skipReason: string }>;
};

export async function getDailyFollowUp(
  boutiqueId: string,
  from: string,
  to: string
): Promise<{
  range: { from: string; to: string };
  days: DailyFollowUpDay[];
  today: DailyFollowUpDay | null;
  absentsByDate: Record<string, Array<{ empId: string; name: string; reason: string | null }>>;
}> {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  const today = toDateOnly(new Date());
  const todayStr = today.toISOString().slice(0, 10);

  const days: DailyFollowUpDay[] = [];
  const empIdsToResolve = new Set<string>();

  const oneDay = 24 * 60 * 60 * 1000;
  let t = fromDate.getTime();
  const toTime = toDate.getTime();
  while (t <= toTime) {
    const d = new Date(t);
    const dateStr = d.toISOString().slice(0, 10);
    if (d > today) {
      t += oneDay;
      continue;
    }
    const run = await getOrCreateDailyRun(boutiqueId, d);
    empIdsToResolve.add(run.assignedEmpId ?? '');
    empIdsToResolve.add(run.completedByEmpId ?? '');
    run.skips.forEach((s) => empIdsToResolve.add(s.empId));
    const skipSummary = run.skips.map((s) => ({ empId: s.empId, name: '', skipReason: s.skipReason }));
    const cutoffMs = getSLACutoffMs(dateStr);
    const effectiveStatus = computeInventoryStatus({
      baseStatus: run.status,
      completedAt: run.completedAt,
      cutoffTimeMs: cutoffMs,
    });
    days.push({
      date: dateStr,
      status: run.status,
      effectiveStatus,
      assignedEmpId: run.assignedEmpId,
      assignedName: null,
      completedByEmpId: run.completedByEmpId,
      completedByName: null,
      completedAt: run.completedAt,
      reason: run.reason,
      skipCount: run.skips.length,
      skipSummary,
    });
    t += oneDay;
  }

  empIdsToResolve.delete('');
  const empList = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: Array.from(empIdsToResolve) } },
    select: { empId: true, name: true },
  });
  const nameByEmp = new Map(empList.map((e) => [e.empId, e.name]));

  for (const day of days) {
    day.assignedName = day.assignedEmpId ? (nameByEmp.get(day.assignedEmpId) ?? day.assignedEmpId) : null;
    day.completedByName = day.completedByEmpId ? (nameByEmp.get(day.completedByEmpId) ?? day.completedByEmpId) : null;
    for (const s of day.skipSummary) {
      s.name = nameByEmp.get(s.empId) ?? s.empId;
    }
  }

  const todayRun = days.find((x) => x.date === todayStr) ?? null;

  const dateStrs = days.map((d) => d.date);
  const absentsInRange = await prisma.inventoryAbsent.findMany({
    where: {
      boutiqueId,
      date: {
        gte: parseDate(from),
        lte: parseDate(to),
      },
    },
  });
  const absentEmpIds = Array.from(new Set(absentsInRange.map((a) => a.empId)));
  const absentEmpNames =
    absentEmpIds.length > 0
      ? new Map(
          (
            await prisma.employee.findMany({
              where: { boutiqueId, empId: { in: absentEmpIds } },
              select: { empId: true, name: true },
            })
          ).map((e) => [e.empId, e.name])
        )
      : new Map<string, string>();
  const absentsByDate: Record<string, Array<{ empId: string; name: string; reason: string | null }>> = {};
  for (const dateStr of dateStrs) absentsByDate[dateStr] = [];
  for (const a of absentsInRange) {
    const dateStr = a.date.toISOString().slice(0, 10);
    if (absentsByDate[dateStr]) {
      absentsByDate[dateStr].push({
        empId: a.empId,
        name: absentEmpNames.get(a.empId) ?? a.empId,
        reason: a.reason,
      });
    }
  }

  return { range: { from, to }, days, today: todayRun, absentsByDate };
}

export type DailyNextProjection = {
  date: string;
  projectedEmpId: string | null;
  projectedName: string | null;
  note: string;
};

export async function getDailyNextProjections(
  boutiqueId: string,
  from: string,
  daysCount: number
): Promise<{ from: string; days: number; projections: DailyNextProjection[] }> {
  const projections: DailyNextProjection[] = [];
  const start = parseDate(from);
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const proj = await getProjectedAssignee(boutiqueId, d);
    projections.push({
      date: dateStr,
      projectedEmpId: proj.projectedEmpId,
      projectedName: proj.projectedName,
      note: proj.note,
    });
  }
  return { from, days: daysCount, projections };
}

export type WeeklyFollowUpByEmployee = {
  empId: string;
  name: string;
  total: number;
  completed: number;
  pending: number;
  pendingZoneCodes: string[];
};

export type WeeklyFollowUpPendingZone = {
  zoneCode: string;
  zoneName: string | null;
  empId: string;
  name: string;
  status: string;
  effectiveStatus: string;
};

export async function getWeeklyFollowUp(boutiqueId: string, weekStart: string): Promise<{
  weekStart: string;
  summary: { totalZones: number; completedZones: number; pendingZones: number };
  byEmployee: WeeklyFollowUpByEmployee[];
  pendingZones: WeeklyFollowUpPendingZone[];
}> {
  const runs = await getWeeklyRuns(boutiqueId, weekStart);
  const totalZones = runs.length;
  const completedZones = runs.filter((r) => r.status === 'COMPLETED').length;
  const pendingZonesCount = totalZones - completedZones;

  const byEmp = new Map<
    string,
    { name: string; total: number; completed: number; pendingZoneCodes: string[] }
  >();
  for (const r of runs) {
    if (!byEmp.has(r.empId)) {
      byEmp.set(r.empId, { name: r.employeeName, total: 0, completed: 0, pendingZoneCodes: [] });
    }
    const row = byEmp.get(r.empId)!;
    row.total += 1;
    if (r.status === 'COMPLETED') row.completed += 1;
    else row.pendingZoneCodes.push(r.zoneCode);
  }
  const byEmployee: WeeklyFollowUpByEmployee[] = Array.from(byEmp.entries()).map(
    ([empId, v]) => ({
      empId,
      name: v.name,
      total: v.total,
      completed: v.completed,
      pending: v.total - v.completed,
      pendingZoneCodes: v.pendingZoneCodes,
    })
  );

  const fridayStr = (() => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().slice(0, 10);
  })();
  const weekCutoffMs = getSLACutoffMs(fridayStr);

  const pendingZones: WeeklyFollowUpPendingZone[] = runs
    .filter((r) => r.status !== 'COMPLETED')
    .map((r) => ({
      zoneCode: r.zoneCode,
      zoneName: r.zoneName,
      empId: r.empId,
      name: r.employeeName,
      status: r.status,
      effectiveStatus: computeInventoryStatus({
        baseStatus: r.status,
        completedAt: r.completedAt,
        cutoffTimeMs: weekCutoffMs,
      }),
    }));

  return {
    weekStart,
    summary: {
      totalZones,
      completedZones,
      pendingZones: pendingZonesCount,
    },
    byEmployee,
    pendingZones,
  };
}
