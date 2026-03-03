/**
 * Key possession & handover (2 keys per boutique).
 * Asia/Riyadh; shift boundaries: AM 09:00, PM 16:00 local.
 */

import { prisma } from '@/lib/db';
/** AM shift start (local) → used for handover "AM holder has key". Riyadh UTC+3 so 09:00 local = 06:00 UTC. */
export const KEY_AM_BOUNDARY_HOUR = 9;
/** PM shift start (local) → used for handover "PM holder has key". 16:00 local = 13:00 UTC. */
export const KEY_PM_BOUNDARY_HOUR = 16;

/** Date string YYYY-MM-DD to Date at 09:00 Riyadh (stored as UTC 06:00) */
export function amBoundaryUtc(dateStr: string): Date {
  return new Date(dateStr + 'T06:00:00.000Z');
}

/** Date string YYYY-MM-DD to Date at 16:00 Riyadh (stored as UTC 13:00) */
export function pmBoundaryUtc(dateStr: string): Date {
  return new Date(dateStr + 'T13:00:00.000Z');
}

/** Ensure boutique has exactly 2 BoutiqueKey rows (keyNumber 1 and 2). */
export async function ensureBoutiqueKeys(boutiqueId: string): Promise<{ key1Id: string; key2Id: string }> {
  const existing = await prisma.boutiqueKey.findMany({
    where: { boutiqueId },
    orderBy: { keyNumber: 'asc' },
  });
  const key1 = existing.find((k) => k.keyNumber === 1);
  const key2 = existing.find((k) => k.keyNumber === 2);
  let key1Id = key1?.id;
  let key2Id = key2?.id;
  if (!key1Id) {
    const created = await prisma.boutiqueKey.create({
      data: { boutiqueId, keyNumber: 1 },
    });
    key1Id = created.id;
  }
  if (!key2Id) {
    const created = await prisma.boutiqueKey.create({
      data: { boutiqueId, keyNumber: 2 },
    });
    key2Id = created.id;
  }
  return { key1Id, key2Id };
}

export type CurrentKeyHolders = {
  key1HolderEmployeeId: string | null;
  key2HolderEmployeeId: string | null;
  key1LastHandoverAt: Date | null;
  key2LastHandoverAt: Date | null;
};

/**
 * Current key holders = last KeyHandover per key (by handoverAt desc).
 */
export async function getCurrentKeyHolders(boutiqueId: string): Promise<CurrentKeyHolders> {
  await ensureBoutiqueKeys(boutiqueId);
  const keys = await prisma.boutiqueKey.findMany({
    where: { boutiqueId },
    orderBy: { keyNumber: 'asc' },
    select: { id: true, keyNumber: true },
  });
  const key1Id = keys.find((k) => k.keyNumber === 1)?.id;
  const key2Id = keys.find((k) => k.keyNumber === 2)?.id;

  const [last1, last2] = await Promise.all([
    key1Id
      ? prisma.keyHandover.findFirst({
          where: { keyId: key1Id },
          orderBy: { handoverAt: 'desc' },
          select: { toEmployeeId: true, handoverAt: true },
        })
      : null,
    key2Id
      ? prisma.keyHandover.findFirst({
          where: { keyId: key2Id },
          orderBy: { handoverAt: 'desc' },
          select: { toEmployeeId: true, handoverAt: true },
        })
      : null,
  ]);

  return {
    key1HolderEmployeeId: last1?.toEmployeeId ?? null,
    key2HolderEmployeeId: last2?.toEmployeeId ?? null,
    key1LastHandoverAt: last1?.handoverAt ?? null,
    key2LastHandoverAt: last2?.handoverAt ?? null,
  };
}

/**
 * Get AM/PM holder empIds for a date from handovers at 09:00 and 16:00 that day (UTC day).
 */
export async function getDayKeyHolders(
  boutiqueId: string,
  dateStr: string
): Promise<{ amHolderEmpId: string | null; pmHolderEmpId: string | null }> {
  const amAt = amBoundaryUtc(dateStr);
  const pmAt = pmBoundaryUtc(dateStr);
  const keys = await prisma.boutiqueKey.findMany({
    where: { boutiqueId },
    select: { id: true },
  });
  const keyIds = keys.map((k) => k.id);
  if (keyIds.length === 0) return { amHolderEmpId: null, pmHolderEmpId: null };

  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
  const handovers = await prisma.keyHandover.findMany({
    where: {
      boutiqueId,
      keyId: { in: keyIds },
      handoverAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { handoverAt: 'asc' },
    select: { handoverAt: true, toEmployeeId: true },
  });

  let amHolderEmpId: string | null = null;
  let pmHolderEmpId: string | null = null;
  const amTime = amAt.getTime();
  const pmTime = pmAt.getTime();
  for (const h of handovers) {
    const t = h.handoverAt.getTime();
    if (t <= amTime) amHolderEmpId = h.toEmployeeId;
    if (t <= pmTime) pmHolderEmpId = h.toEmployeeId;
  }
  return { amHolderEmpId, pmHolderEmpId };
}

export type DayKeyAssignment = {
  date: string;
  amHolderEmpId: string | null;
  pmHolderEmpId: string | null;
};

export type WeekKeyPlan = {
  weekStart: string;
  days: DayKeyAssignment[];
  currentHolders: CurrentKeyHolders;
};

/**
 * Get key plan for a week: for each date in [weekStart..weekStart+6], AM/PM holder from handovers.
 */
export async function getWeekKeyPlan(boutiqueId: string, weekStart: string): Promise<WeekKeyPlan> {
  const currentHolders = await getCurrentKeyHolders(boutiqueId);
  const days: DayKeyAssignment[] = [];
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const { amHolderEmpId, pmHolderEmpId } = await getDayKeyHolders(boutiqueId, dateStr);
    days.push({ date: dateStr, amHolderEmpId, pmHolderEmpId });
  }
  return { weekStart, days, currentHolders };
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Apply week key plan: create handovers so each day has AM holder with key at 09:00 and PM holder at 16:00.
 * Deterministic: key1 is used for AM boundary, key2 for PM boundary. Continuity handover (PM(D) -> AM(D+1)) uses key1 at next day 06:00.
 * Removes existing handovers in the week range (weekStart 00:00 to weekStart+7 00:00) before creating, so re-save is idempotent.
 */
export async function applyWeekKeyPlan(
  boutiqueId: string,
  weekStart: string,
  assignments: DayKeyAssignment[],
  createdByUserId: string
): Promise<{ created: number }> {
  const { key1Id, key2Id } = await ensureBoutiqueKeys(boutiqueId);
  const rangeStart = new Date(weekStart + 'T00:00:00.000Z');
  const rangeEnd = new Date(addDays(weekStart, 7) + 'T00:00:00.000Z');
  await prisma.keyHandover.deleteMany({
    where: {
      boutiqueId,
      handoverAt: { gte: rangeStart, lt: rangeEnd },
    },
  });
  let key1Holder = (await getCurrentKeyHolders(boutiqueId)).key1HolderEmployeeId;
  let key2Holder = (await getCurrentKeyHolders(boutiqueId)).key2HolderEmployeeId;
  let created = 0;
  const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    const amHolder = day.amHolderEmpId?.trim() || null;
    const pmHolder = day.pmHolderEmpId?.trim() || null;
    if (!amHolder || !pmHolder) continue;

    const nextDate = i < sorted.length - 1 ? sorted[i + 1].date : null;
    const nextAmHolder = nextDate ? (assignments.find((a) => a.date === nextDate)?.amHolderEmpId?.trim() || null) : null;

    if (key1Holder !== amHolder) {
      await prisma.keyHandover.create({
        data: {
          boutiqueId,
          keyId: key1Id,
          fromEmployeeId: key1Holder,
          toEmployeeId: amHolder,
          handoverAt: amBoundaryUtc(day.date),
          note: `Week plan: AM holder ${day.date}`,
          createdByUserId,
        },
      });
      key1Holder = amHolder;
      created++;
    }

    if (key2Holder !== pmHolder) {
      await prisma.keyHandover.create({
        data: {
          boutiqueId,
          keyId: key2Id,
          fromEmployeeId: key2Holder,
          toEmployeeId: pmHolder,
          handoverAt: pmBoundaryUtc(day.date),
          note: `Week plan: PM holder ${day.date}`,
          createdByUserId,
        },
      });
      key2Holder = pmHolder;
      created++;
    }

    if (nextDate && nextAmHolder && pmHolder !== nextAmHolder) {
      const continuityAt = new Date(nextDate + 'T06:00:00.000Z');
      if (key1Holder !== nextAmHolder) {
        await prisma.keyHandover.create({
          data: {
            boutiqueId,
            keyId: key1Id,
            fromEmployeeId: key1Holder,
            toEmployeeId: nextAmHolder,
            handoverAt: continuityAt,
            note: `Handover to next day AM holder ${nextDate}`,
            createdByUserId,
          },
        });
        key1Holder = nextAmHolder;
        created++;
      }
    }
  }

  return { created };
}
