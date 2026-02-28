import { prisma } from '@/lib/db';
import type { InventoryWeeklyZoneRunStatus } from '@prisma/client';

/** Week start = Saturday (UTC). Returns YYYY-MM-DD of the Saturday that starts the week containing the given date */
export function weekStartFor(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  const offset = (day + 1) % 7; // Sat=0, Sun=1, Mon=2, ...
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export async function listZones(boutiqueId: string) {
  return prisma.inventoryZone.findMany({
    where: { boutiqueId, active: true },
    orderBy: { code: 'asc' },
    include: {
      assignments: {
        where: { active: true },
        include: { employee: { select: { empId: true, name: true } } },
      },
    },
  });
}

export async function createZone(boutiqueId: string, code: string, name?: string | null) {
  return prisma.inventoryZone.create({
    data: { boutiqueId, code: code.toUpperCase().trim(), name: name ?? null, active: true },
  });
}

export async function updateZone(id: string, data: { code?: string; name?: string | null; active?: boolean }) {
  return prisma.inventoryZone.update({
    where: { id },
    data: {
      ...(data.code != null && { code: data.code.toUpperCase().trim() }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.active !== undefined && { active: data.active }),
    },
  });
}

export async function deleteZone(id: string) {
  return prisma.inventoryZone.delete({ where: { id } });
}

export async function getAssignments(boutiqueId: string) {
  const zones = await prisma.inventoryZone.findMany({
    where: { boutiqueId, active: true },
    orderBy: { code: 'asc' },
    include: {
      assignments: {
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { employee: { select: { empId: true, name: true } } },
      },
    },
  });
  return zones.map((z) => ({
    zoneId: z.id,
    zoneCode: z.code,
    zoneName: z.name,
    empId: z.assignments[0]?.empId ?? null,
    employeeName: z.assignments[0]?.employee?.name ?? null,
  }));
}

/** Set or clear assignment. One active assignment per zone (enforced by deactivating previous). */
export async function setAssignment(zoneId: string, empId: string | null) {
  const existing = await prisma.inventoryZoneAssignment.findFirst({
    where: { zoneId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    await prisma.inventoryZoneAssignment.update({
      where: { id: existing.id },
      data: { active: false },
    });
  }
  if (empId) {
    await prisma.inventoryZoneAssignment.create({
      data: { zoneId, empId, active: true },
    });
  }
}

export async function getWeeklyRuns(boutiqueId: string, weekStart: string) {
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const zones = await prisma.inventoryZone.findMany({
    where: { boutiqueId, active: true },
    orderBy: { code: 'asc' },
    include: {
      assignments: {
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { employee: { select: { empId: true, name: true } } },
      },
    },
  });

  const runs: Array<{
    id: string;
    zoneId: string;
    zoneCode: string;
    zoneName: string | null;
    empId: string;
    employeeName: string;
    status: InventoryWeeklyZoneRunStatus;
    notes: string | null;
    completedAt: Date | null;
  }> = [];

  for (const zone of zones) {
    const assignedEmpId = zone.assignments[0]?.empId ?? null;
    const employeeName = zone.assignments[0]?.employee?.name ?? '—';
    if (!assignedEmpId) continue;

    let run = await prisma.inventoryWeeklyZoneRun.findUnique({
      where: { weekStart_zoneId: { weekStart: startDate, zoneId: zone.id } },
    });
    if (!run) {
      run = await prisma.inventoryWeeklyZoneRun.create({
        data: {
          boutiqueId: zone.boutiqueId,
          weekStart: startDate,
          zoneId: zone.id,
          empId: assignedEmpId,
          status: 'PENDING',
        },
      });
    }
    runs.push({
      id: run.id,
      zoneId: zone.id,
      zoneCode: zone.code,
      zoneName: zone.name,
      empId: run.empId,
      employeeName,
      status: run.status,
      notes: run.notes,
      completedAt: run.completedAt,
    });
  }
  return runs;
}

export type WeeklyRunItem = {
  id: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  status: InventoryWeeklyZoneRunStatus;
  completedAt: Date | null;
};

export type WeeklyRunByEmployee = {
  empId: string;
  employeeName: string;
  zones: WeeklyRunItem[];
};

/** Get weekly runs grouped by assignee and optionally "my zones" for session user */
export async function getWeeklyRunsGrouped(
  boutiqueId: string,
  weekStart: string,
  sessionEmpId: string | null
): Promise<{
  byEmployee: WeeklyRunByEmployee[];
  myZones: WeeklyRunItem[];
}> {
  const runs = await getWeeklyRuns(boutiqueId, weekStart);
  const byEmp = new Map<string, { employeeName: string; zones: WeeklyRunItem[] }>();
  for (const r of runs) {
    const item: WeeklyRunItem = {
      id: r.id,
      zoneId: r.zoneId,
      zoneCode: r.zoneCode,
      zoneName: r.zoneName,
      status: r.status,
      completedAt: r.completedAt,
    };
    if (!byEmp.has(r.empId)) {
      byEmp.set(r.empId, { employeeName: r.employeeName, zones: [] });
    }
    byEmp.get(r.empId)!.zones.push(item);
  }
  const byEmployee: WeeklyRunByEmployee[] = Array.from(byEmp.entries()).map(([empId, v]) => ({
    empId,
    employeeName: v.employeeName,
    zones: v.zones,
  }));
  const myZones = sessionEmpId ? runs.filter((r) => r.empId === sessionEmpId).map((r) => ({
    id: r.id,
    zoneId: r.zoneId,
    zoneCode: r.zoneCode,
    zoneName: r.zoneName,
    status: r.status,
    completedAt: r.completedAt,
  })) : [];
  return { byEmployee, myZones };
}

/** Today at start of day (UTC) for effectiveFrom comparison */
const todayDate = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function getMyActiveZoneAssignmentForCurrentQuarter(
  userId: string
): Promise<{ zone: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { empId: true },
  });
  if (!user?.empId) return null;

  const today = todayDate();
  const assignment = await prisma.inventoryZoneAssignment.findFirst({
    where: {
      empId: user.empId,
      active: true,
      OR: [
        { effectiveFrom: null },
        { effectiveFrom: { lte: today } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { zone: { select: { code: true } } },
  });

  if (assignment?.zone?.code) return { zone: assignment.zone.code };

  // Fallback: if no active assignment, use this week's run (e.g. zone was reassigned but run still has them)
  const weekStartStr = weekStartFor(new Date());
  const weekStartDate = new Date(weekStartStr + 'T00:00:00Z');
  const run = await prisma.inventoryWeeklyZoneRun.findFirst({
    where: { empId: user.empId, weekStart: weekStartDate },
    include: { zone: { select: { code: true } } },
  });
  if (run?.zone?.code) return { zone: run.zone.code };

  return null;
}

export async function markWeeklyZoneCompleted(
  weekStart: string,
  zoneId: string
): Promise<{ ok: boolean; error?: string }> {
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const run = await prisma.inventoryWeeklyZoneRun.findUnique({
    where: { weekStart_zoneId: { weekStart: startDate, zoneId } },
  });
  if (!run) return { ok: false, error: 'Run not found' };
  if (run.status === 'COMPLETED') return { ok: false, error: 'Already completed' };
  await prisma.inventoryWeeklyZoneRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return { ok: true };
}
