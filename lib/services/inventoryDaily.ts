import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import { employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { availabilityFor } from '@/lib/services/availability';
import { logAudit } from '@/lib/audit';
import type { InventoryDailyRunSkipReason, InventoryDailyRunStatus, LeaveType } from '@prisma/client';

const CONFIG_KEY = 'DAILY_INVENTORY';

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

type SkipCategory = 'SHORT' | 'LONG';

const QUEUE_EXPIRY_DAYS = 7;

async function classifySkipCategory(
  empId: string,
  date: Date,
  skipReason: InventoryDailyRunSkipReason
): Promise<{ category: SkipCategory; expectedReturnDate: Date | null }> {
  const d = toDateOnly(date);

  // Default to SHORT (queue-eligible)
  let category: SkipCategory = 'SHORT';
  let expectedReturnDate: Date | null = null;

  if (skipReason === 'LEAVE') {
    const leave = await prisma.leave.findFirst({
      where: {
        empId,
        status: 'APPROVED',
        startDate: { lte: d },
        endDate: { gte: d },
      },
      select: { type: true, startDate: true, endDate: true },
    });
    if (leave) {
      const start = toDateOnly(leave.startDate);
      const end = toDateOnly(leave.endDate);
      const days =
        Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const isAnnual = leave.type === ('ANNUAL' as LeaveType);
      if (isAnnual || days > 1) {
        category = 'LONG';
      }
      expectedReturnDate = end;
    }
  } else if (skipReason === 'INACTIVE') {
    category = 'LONG';
  } else {
    // OFF / ABSENT / EXCLUDED / EXCLUDED_TODAY treated as SHORT
    category = 'SHORT';
  }

  return { category, expectedReturnDate };
}

async function hasCompletedYesterday(boutiqueId: string, empId: string, today: Date): Promise<boolean> {
  const yesterday = toDateOnly(new Date(today));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const run = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: yesterday } },
  });
  if (!run || run.status !== 'COMPLETED') return false;
  if (run.completedByEmpId === empId) return true;
  if (!run.completedByEmpId && run.assignedEmpId === empId) return true;
  return false;
}

async function enqueueShortSkip(
  boutiqueId: string,
  empId: string,
  date: Date,
  skipReason: InventoryDailyRunSkipReason
) {
  const { category } = await classifySkipCategory(empId, date, skipReason);
  if (category === 'LONG') return;

  const queuedAt = new Date();
  const expiresAt = new Date(queuedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + QUEUE_EXPIRY_DAYS);

  const dateOnly = toDateOnly(date);

  const existing = await prisma.inventoryDailyWaitingQueue.findFirst({
    where: { boutiqueId, empId },
  });

  if (existing) {
    await prisma.inventoryDailyWaitingQueue.update({
      where: { id: existing.id },
      data: {
        reason: skipReason,
        lastSkippedDate: dateOnly,
        expiresAt,
      },
    });
  } else {
    await prisma.inventoryDailyWaitingQueue.create({
      data: {
        boutiqueId,
        empId,
        reason: skipReason,
        queuedAt,
        expiresAt,
        lastSkippedDate: dateOnly,
      },
    });
  }

  await logAudit(
    'system',
    'DAILY_QUEUE_ENQUEUED',
    'InventoryDailyWaitingQueue',
    empId,
    null,
    JSON.stringify({ empId, queuedAt: queuedAt.toISOString(), expiresAt: expiresAt.toISOString(), skipReason }),
    null,
    { module: 'INVENTORY', targetEmployeeId: empId, targetDate: dateOnly.toISOString().slice(0, 10) }
  );
}

async function consumeFromQueue(boutiqueId: string, date: Date): Promise<{
  assignedEmpId: string | null;
  source: 'QUEUE' | 'NONE';
}> {
  const now = new Date();
  const d = toDateOnly(date);

  // Clean up expired entries and log
  const expired = await prisma.inventoryDailyWaitingQueue.findMany({
    where: { boutiqueId, expiresAt: { lte: now } },
  });
  if (expired.length > 0) {
    await prisma.inventoryDailyWaitingQueue.deleteMany({
      where: { id: { in: expired.map((e) => e.id) } },
    });
    for (const e of expired) {
      await logAudit(
        'system',
        'DAILY_QUEUE_EXPIRED',
        'InventoryDailyWaitingQueue',
        e.id,
        JSON.stringify({ empId: e.empId }),
        null,
        null,
        {
          module: 'INVENTORY',
          targetEmployeeId: e.empId,
          targetDate: d.toISOString().slice(0, 10),
        }
      );
    }
  }

  const candidates = await prisma.inventoryDailyWaitingQueue.findMany({
    where: { boutiqueId, expiresAt: { gt: now } },
    orderBy: { queuedAt: 'asc' },
  });
  if (candidates.length === 0) {
    return { assignedEmpId: null, source: 'NONE' };
  }

  const eligibleSet = new Set(await computeEligibleEmployees(boutiqueId, d));

  for (const c of candidates) {
    if (!eligibleSet.has(c.empId)) continue;
    if (await hasCompletedYesterday(boutiqueId, c.empId, d)) continue;

    await prisma.inventoryDailyWaitingQueue.delete({
      where: { id: c.id },
    });

    await logAudit(
      'system',
      'DAILY_QUEUE_ASSIGNED',
      'InventoryDailyWaitingQueue',
      c.id,
      JSON.stringify({ empId: c.empId }),
      JSON.stringify({ empId: c.empId, date: d.toISOString().slice(0, 10) }),
      null,
      {
        module: 'INVENTORY',
        targetEmployeeId: c.empId,
        targetDate: d.toISOString().slice(0, 10),
      }
    );

    return { assignedEmpId: c.empId, source: 'QUEUE' };
  }

  return { assignedEmpId: null, source: 'NONE' };
}

/** EmpIds excluded for that date (absent / not available today) */
export async function getExcludedEmpIdsForDate(boutiqueId: string, date: Date): Promise<Set<string>> {
  const d = toDateOnly(date);
  const rows = await prisma.inventoryDailyExclusion.findMany({
    where: { boutiqueId, date: d },
    select: { empId: true },
  });
  return new Set(rows.map((r) => r.empId));
}

/** Active employees eligible for daily inventory: not boutique manager, not excluded, availability = WORK, not in InventoryDailyExclusion for that date */
export async function computeEligibleEmployees(boutiqueId: string, date: Date): Promise<string[]> {
  const d = toDateOnly(date);
  const excludedToday = await getExcludedEmpIdsForDate(boutiqueId, d);
  const employees = await prisma.employee.findMany({
    where: {
      boutiqueId,
      active: true,
      isSystemOnly: false,
      isBoutiqueManager: false,
      excludeFromDailyInventory: false,
      ...notDisabledUserWhere,
    },
    select: { empId: true },
    orderBy: employeeOrderByStable,
  });
  const eligible: string[] = [];
  for (const e of employees) {
    if (excludedToday.has(e.empId)) continue;
    const status = await availabilityFor(e.empId, d, boutiqueId);
    if (status === 'WORK') eligible.push(e.empId);
  }
  return eligible;
}

async function getOrCreateConfig(boutiqueId: string) {
  let config = await prisma.inventoryRotationConfig.findUnique({
    where: { boutiqueId_key: { boutiqueId, key: CONFIG_KEY } },
    include: { members: { where: { isActive: true }, orderBy: { baseOrderIndex: 'asc' } } },
  });
  if (!config) {
    config = await prisma.inventoryRotationConfig.create({
      data: {
        boutiqueId,
        key: CONFIG_KEY,
        enabled: true,
        monthRebalanceEnabled: true,
      },
      include: { members: { orderBy: { baseOrderIndex: 'asc' } } },
    });
  }
  return config;
}

/** Ensure rotation has at least one member; if none, seed from current eligible set for today */
async function ensureRotationMembers(boutiqueId: string, date: Date) {
  const config = await getOrCreateConfig(boutiqueId);
  if (config.members.length > 0) return config;
  const eligible = await computeEligibleEmployees(boutiqueId, date);
  const existing = await prisma.employee.findMany({
    where: {
      boutiqueId,
      empId: { in: eligible },
      active: true,
      isSystemOnly: false,
      isBoutiqueManager: false,
      excludeFromDailyInventory: false,
      ...notDisabledUserWhere,
    },
    select: { empId: true },
    orderBy: employeeOrderByStable,
  });
  for (let i = 0; i < existing.length; i++) {
    await prisma.inventoryRotationMember.upsert({
      where: {
        configId_empId: { configId: config.id, empId: existing[i].empId },
      },
      create: {
        configId: config.id,
        empId: existing[i].empId,
        baseOrderIndex: i,
        isActive: true,
      },
      update: { baseOrderIndex: i, isActive: true },
    });
  }
  return getOrCreateConfig(boutiqueId);
}

/**
 * Get or create daily run. Rotation-only policy: assignee is chosen ONLY by rotation order + eligibility
 * (no other ranking: no shift, no fairness-within-month for same-day). Monthly rebalance affects
 * next month ordering only (baseOrderIndex).
 */
export async function getOrCreateDailyRun(boutiqueId: string, date: Date): Promise<{
  runId: string;
  date: string;
  assignedEmpId: string | null;
  status: InventoryDailyRunStatus;
  reason: string | null;
  completedByEmpId: string | null;
  completedAt: Date | null;
  skips: Array<{ empId: string; skipReason: InventoryDailyRunSkipReason }>;
  assignmentSource: 'QUEUE' | 'ROTATION' | 'UNASSIGNED';
  decisionExplanation: string | null;
}> {
  const d = toDateOnly(date);
  const dateStr = d.toISOString().slice(0, 10);

  const config = await ensureRotationMembers(boutiqueId, d);
  if (!config.enabled) {
    const run = await prisma.inventoryDailyRun.upsert({
      where: { boutiqueId_date: { boutiqueId, date: d } },
      create: {
        boutiqueId,
        date: d,
        status: 'UNASSIGNED',
        reason: 'Rotation disabled',
      },
      update: {},
    });
    return {
      runId: run.id,
      date: dateStr,
      assignedEmpId: null,
      status: run.status,
      reason: run.reason,
      completedByEmpId: run.completedByEmpId,
      completedAt: run.completedAt,
      skips: [],
      assignmentSource: 'UNASSIGNED' as const,
      decisionExplanation: 'Rotation disabled',
    };
  }

  const order = config.members.map((m) => m.empId);
  if (order.length === 0) {
    const run = await prisma.inventoryDailyRun.upsert({
      where: { boutiqueId_date: { boutiqueId, date: d } },
      create: {
        boutiqueId,
        date: d,
        status: 'UNASSIGNED',
        reason: 'No rotation members',
      },
      update: {},
    });
    return {
      runId: run.id,
      date: dateStr,
      assignedEmpId: null,
      status: run.status,
      reason: run.reason,
      completedByEmpId: run.completedByEmpId,
      completedAt: run.completedAt,
      skips: [],
      assignmentSource: 'UNASSIGNED' as const,
      decisionExplanation: 'No rotation members',
    };
  }

  const existing = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: d } },
    include: { skips: true },
  });

  if (existing && existing.assignedEmpId != null) {
    return {
      runId: existing.id,
      date: dateStr,
      assignedEmpId: existing.assignedEmpId,
      status: existing.status,
      reason: existing.reason,
      completedByEmpId: existing.completedByEmpId,
      completedAt: existing.completedAt,
      skips: existing.skips.map((s) => ({ empId: s.empId, skipReason: s.skipReason })),
      assignmentSource: 'UNASSIGNED',
      decisionExplanation: null,
    };
  }

  const eligibleSet = new Set(await computeEligibleEmployees(boutiqueId, d));
  const excludedToday = await getExcludedEmpIdsForDate(boutiqueId, d);
  const startIndex = dayOfYear(d) % order.length;
  const skips: Array<{ empId: string; skipReason: InventoryDailyRunSkipReason }> = [];
  let assignedEmpId: string | null = null;
  let reason: string | null = null;
  let assignmentSource: 'QUEUE' | 'ROTATION' | 'UNASSIGNED' = 'UNASSIGNED';
  let decisionExplanation: string | null = null;

  // First, try to assign from waiting queue
  const fromQueue = await consumeFromQueue(boutiqueId, d);
  if (fromQueue.assignedEmpId) {
    assignedEmpId = fromQueue.assignedEmpId;
    assignmentSource = 'QUEUE';
    decisionExplanation = `Assigned from waiting queue: ${assignedEmpId}`;
  } else {
    // Fallback to rotation as before, but enqueue SHORT skips
    let primaryCandidate: string | null = null;
    let primarySkipReason: InventoryDailyRunSkipReason | null = null;

    for (let i = 0; i < order.length; i++) {
      const empId = order[(startIndex + i) % order.length];
      if (!primaryCandidate) primaryCandidate = empId;
      if (eligibleSet.has(empId)) {
        assignedEmpId = empId;
        assignmentSource = 'ROTATION';
        break;
      }
      if (excludedToday.has(empId)) {
        const skipReason: InventoryDailyRunSkipReason = 'EXCLUDED_TODAY';
        skips.push({ empId, skipReason });
        if (!primarySkipReason && empId === primaryCandidate) primarySkipReason = skipReason;
        continue;
      }
      const emp = await prisma.employee.findUnique({
        where: { empId },
        select: { active: true, isBoutiqueManager: true, excludeFromDailyInventory: true },
      });
      let skipReason: InventoryDailyRunSkipReason = 'INACTIVE';
      if (emp?.isBoutiqueManager) skipReason = 'EXCLUDED';
      else if (emp?.excludeFromDailyInventory) skipReason = 'EXCLUDED';
      else {
        const av = await availabilityFor(empId, d, boutiqueId);
        if (av === 'LEAVE') skipReason = 'LEAVE';
        else if (av === 'OFF') skipReason = 'OFF';
        else if (av === 'ABSENT') skipReason = 'ABSENT';
      }
      skips.push({ empId, skipReason });

      // Enqueue only SHORT skips
      await enqueueShortSkip(boutiqueId, empId, d, skipReason);

      if (!primarySkipReason && empId === primaryCandidate) primarySkipReason = skipReason;

      await logAudit(
        'system',
        'DAILY_ROTATION_SKIPPED',
        'InventoryDailyRun',
        empId,
        null,
        JSON.stringify({ empId, date: dateStr, skipReason }),
        null,
        { module: 'INVENTORY', targetEmployeeId: empId, targetDate: dateStr }
      );
    }

    if (assignedEmpId) {
      reason = null;
      if (primaryCandidate && primarySkipReason) {
        decisionExplanation = `Primary candidate ${primaryCandidate} skipped (${primarySkipReason}); assigned ${assignedEmpId} from rotation.`;
      } else {
        decisionExplanation = `Assigned ${assignedEmpId} from rotation.`;
      }
      await logAudit(
        'system',
        'DAILY_ROTATION_ASSIGNED',
        'InventoryDailyRun',
        assignedEmpId,
        null,
        JSON.stringify({ empId: assignedEmpId, date: dateStr }),
        null,
        { module: 'INVENTORY', targetEmployeeId: assignedEmpId, targetDate: dateStr }
      );
    } else {
      reason = 'No eligible employee in rotation (all skipped)';
    }
  }

  const run = await prisma.inventoryDailyRun.upsert({
    where: { boutiqueId_date: { boutiqueId, date: d } },
    create: {
      boutiqueId,
      date: d,
      assignedEmpId,
      status: assignedEmpId ? 'PENDING' : 'UNASSIGNED',
      reason,
      skips: {
        create: skips.map((s) => ({ empId: s.empId, skipReason: s.skipReason })),
      },
    },
    update: {
      assignedEmpId,
      status: assignedEmpId ? 'PENDING' : 'UNASSIGNED',
      reason,
      skips: undefined,
    },
    include: { skips: true },
  });

  if (existing && run.skips.length === 0 && skips.length > 0) {
    await prisma.inventoryDailyRunSkip.createMany({
      data: skips.map((s) => ({ runId: run.id, empId: s.empId, skipReason: s.skipReason })),
    });
  }

  return {
    runId: run.id,
    date: dateStr,
    assignedEmpId: run.assignedEmpId,
    status: run.status,
    reason: run.reason,
    completedByEmpId: run.completedByEmpId,
    completedAt: run.completedAt,
    skips: run.skips.length ? run.skips.map((s) => ({ empId: s.empId, skipReason: s.skipReason })) : skips,
    assignmentSource,
    decisionExplanation,
  };
}

export async function markDailyCompleted(
  boutiqueId: string,
  date: Date,
  completedByEmpId: string
): Promise<{ ok: boolean; error?: string }> {
  const d = toDateOnly(date);
  const run = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: d } },
  });
  if (!run) return { ok: false, error: 'Run not found' };
  if (run.status === 'COMPLETED') return { ok: false, error: 'Already completed' };
  if (run.assignedEmpId && run.assignedEmpId !== completedByEmpId) {
    const user = await prisma.user.findFirst({
      where: { empId: completedByEmpId },
      select: { role: true },
    });
    if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN') {
      return { ok: false, error: 'Only assigned employee or manager/admin can mark completed' };
    }
  }
  await prisma.inventoryDailyRun.update({
    where: { boutiqueId_date: { boutiqueId, date: d } },
    data: {
      status: 'COMPLETED',
      completedByEmpId,
      completedAt: new Date(),
    },
  });
  return { ok: true };
}

/** Reorder rotation members so that those with fewer completed runs in the previous month come first */
export async function monthlyRebalance(boutiqueId: string, month: string): Promise<{ ok: boolean; error?: string }> {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return { ok: false, error: 'Invalid month YYYY-MM' };
  const prevMonthStart = new Date(Date.UTC(y, m - 2, 1));
  const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));

  const config = await getOrCreateConfig(boutiqueId);
  if (!config.monthRebalanceEnabled) return { ok: true };

  const completedCounts = await prisma.inventoryDailyRun.groupBy({
    by: ['assignedEmpId'],
    where: {
      boutiqueId,
      date: { gte: prevMonthStart, lte: prevMonthEnd },
      status: 'COMPLETED',
      assignedEmpId: { not: null },
    },
    _count: { assignedEmpId: true },
  });
  const countByEmp = new Map<string, number>();
  for (const row of completedCounts) {
    if (row.assignedEmpId) countByEmp.set(row.assignedEmpId, row._count.assignedEmpId);
  }

  const members = await prisma.inventoryRotationMember.findMany({
    where: { configId: config.id, isActive: true },
    orderBy: { baseOrderIndex: 'asc' },
  });
  const sorted = [...members].sort((a, b) => {
    const ca = countByEmp.get(a.empId) ?? 0;
    const cb = countByEmp.get(b.empId) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.empId.localeCompare(b.empId);
  });
  for (let i = 0; i < sorted.length; i++) {
    await prisma.inventoryRotationMember.update({
      where: { id: sorted[i].id },
      data: { baseOrderIndex: i },
    });
  }
  return { ok: true };
}

/** List exclusions for a date (manager/admin) */
export async function getExclusionsForDate(boutiqueId: string, date: Date): Promise<
  Array<{ id: string; empId: string; employeeName: string; reason: string | null; createdAt: Date }>
> {
  const d = toDateOnly(date);
  const rows = await prisma.inventoryDailyExclusion.findMany({
    where: { boutiqueId, date: d },
    select: { id: true, empId: true, reason: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const empIds = Array.from(new Set(rows.map((r) => r.empId)));
  const employees = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIds } },
    select: { empId: true, name: true },
  });
  const nameByEmp = new Map(employees.map((e) => [e.empId, e.name]));
  return rows.map((r) => ({
    ...r,
    employeeName: nameByEmp.get(r.empId) ?? r.empId,
  }));
}

/** Add exclusion for date (manager/admin). Idempotent per (boutiqueId, date, empId). */
export async function addExclusion(
  boutiqueId: string,
  date: Date,
  empId: string,
  reason: string | null,
  createdByUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const d = toDateOnly(date);
  await prisma.inventoryDailyExclusion.upsert({
    where: {
      boutiqueId_date_empId: { boutiqueId, date: d, empId },
    },
    create: { boutiqueId, date: d, empId, reason, createdByUserId },
    update: { reason },
  });
  return { ok: true };
}

/** Remove exclusion for date + empId (manager/admin) */
export async function removeExclusion(boutiqueId: string, date: Date, empId: string): Promise<{ ok: boolean }> {
  const d = toDateOnly(date);
  await prisma.inventoryDailyExclusion.deleteMany({
    where: { boutiqueId, date: d, empId },
  });
  return { ok: true };
}

/** Recompute assignee for date: only when run exists and not completed. Picks next eligible in rotation order; logs to AuditLog. */
export async function recomputeDailyAssignee(
  boutiqueId: string,
  date: Date,
  actorUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const d = toDateOnly(date);
  const run = await prisma.inventoryDailyRun.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: d } },
    include: { skips: true },
  });
  if (!run) return { ok: false, error: 'Run not found' };
  if (run.status === 'COMPLETED') return { ok: false, error: 'Cannot recompute: run already completed' };

  const config = await getOrCreateConfig(boutiqueId);
  const order = config.members.map((m) => m.empId);
  if (order.length === 0) return { ok: false, error: 'No rotation members' };

  const eligibleSet = new Set(await computeEligibleEmployees(boutiqueId, d));
  const excludedToday = await getExcludedEmpIdsForDate(boutiqueId, d);
  const startIndex = dayOfYear(d) % order.length;
  const skips: Array<{ empId: string; skipReason: InventoryDailyRunSkipReason }> = [];
  let assignedEmpId: string | null = null;
  let reason: string | null = null;

  for (let i = 0; i < order.length; i++) {
    const empId = order[(startIndex + i) % order.length];
    if (eligibleSet.has(empId)) {
      assignedEmpId = empId;
      break;
    }
    if (excludedToday.has(empId)) {
      skips.push({ empId, skipReason: 'EXCLUDED_TODAY' });
      continue;
    }
    const emp = await prisma.employee.findUnique({
      where: { empId },
      select: { active: true, isBoutiqueManager: true, excludeFromDailyInventory: true },
    });
    let skipReason: InventoryDailyRunSkipReason = 'INACTIVE';
    if (emp?.isBoutiqueManager) skipReason = 'EXCLUDED';
    else if (emp?.excludeFromDailyInventory) skipReason = 'EXCLUDED';
    else {
      const av = await availabilityFor(empId, d, boutiqueId);
      if (av === 'LEAVE') skipReason = 'LEAVE';
      else if (av === 'OFF') skipReason = 'OFF';
      else if (av === 'ABSENT') skipReason = 'ABSENT';
    }
    skips.push({ empId, skipReason });
  }
  if (!assignedEmpId) reason = 'No eligible employee in rotation (all skipped)';

  const beforeJson = JSON.stringify({
    assignedEmpId: run.assignedEmpId,
    status: run.status,
  });
  const afterJson = JSON.stringify({
    assignedEmpId,
    status: assignedEmpId ? 'PENDING' : 'UNASSIGNED',
    reason,
  });

  await prisma.inventoryDailyRunSkip.deleteMany({ where: { runId: run.id } });
  await prisma.inventoryDailyRun.update({
    where: { boutiqueId_date: { boutiqueId, date: d } },
    data: {
      assignedEmpId,
      status: assignedEmpId ? 'PENDING' : 'UNASSIGNED',
      reason,
      skips: {
        create: skips.map((s) => ({ empId: s.empId, skipReason: s.skipReason })),
      },
    },
  });
  await logAudit(
    actorUserId,
    'INVENTORY_DAILY_RECOMPUTE',
    'InventoryDailyRun',
    run.id,
    beforeJson,
    afterJson,
    null,
    { module: 'INVENTORY', targetDate: run.date.toISOString().slice(0, 10) }
  );
  return { ok: true };
}

/**
 * Projected assignee for a date (read-only, no DB run created). Uses rotation order + eligibility.
 * For future dates eligibility depends on leave/off in DB; note indicates "may change".
 */
export async function getProjectedAssignee(boutiqueId: string, date: Date): Promise<{
  projectedEmpId: string | null;
  projectedName: string | null;
  note: string;
}> {
  const d = toDateOnly(date);
  const config = await getOrCreateConfig(boutiqueId);
  const order = config.members.map((m) => m.empId);
  if (order.length === 0) {
    return { projectedEmpId: null, projectedName: null, note: 'No rotation members' };
  }
  if (!config.enabled) {
    return { projectedEmpId: null, projectedName: null, note: 'Rotation disabled' };
  }
  const eligibleSet = new Set(await computeEligibleEmployees(boutiqueId, d));
  const startIndex = dayOfYear(d) % order.length;
  for (let i = 0; i < order.length; i++) {
    const empId = order[(startIndex + i) % order.length];
    if (eligibleSet.has(empId)) {
      const emp = await prisma.employee.findFirst({
        where: { boutiqueId, empId },
        select: { name: true },
      });
      const note = 'Eligibility may change (leave/off)';
      return {
        projectedEmpId: empId,
        projectedName: emp?.name ?? empId,
        note,
      };
    }
  }
  const note = 'No eligible employee in rotation';
  return { projectedEmpId: null, projectedName: null, note };
}

/** Stats for a month: completed count per employee */
export async function getDailyStats(boutiqueId: string, month: string): Promise<{
  byEmployee: Array<{ empId: string; name: string; completed: number }>;
  totalCompleted: number;
}> {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return { byEmployee: [], totalCompleted: 0 };
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));

  const runs = await prisma.inventoryDailyRun.findMany({
    where: {
      boutiqueId,
      date: { gte: start, lte: end },
      status: 'COMPLETED',
      assignedEmpId: { not: null },
    },
    select: { completedByEmpId: true, assignedEmpId: true },
  });
  const byEmp = new Map<string, number>();
  for (const r of runs) {
    const empId = r.completedByEmpId ?? r.assignedEmpId ?? '';
    if (empId) byEmp.set(empId, (byEmp.get(empId) ?? 0) + 1);
  }
  const employees = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: Array.from(byEmp.keys()) } },
    select: { empId: true, name: true },
  });
  const byEmployee = employees.map((e) => ({
    empId: e.empId,
    name: e.name,
    completed: byEmp.get(e.empId) ?? 0,
  }));
  byEmployee.sort((a, b) => b.completed - a.completed);
  const totalCompleted = runs.length;
  return { byEmployee, totalCompleted };
}
