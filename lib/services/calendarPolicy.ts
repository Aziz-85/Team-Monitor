/**
 * Calendar policy: official holidays (closed/open) and event periods (suspend weekly off / force work).
 * Single source for availability and schedule grid. All dates YYYY-MM-DD Riyadh.
 */

import { prisma } from '@/lib/db';

export type OfficialHolidayInfo = { isClosed: boolean; name: string };
export type EventPeriodInfo = { suspendWeeklyOff: boolean; forceWork: boolean; name: string };

/** Get official holiday for boutique on date, if any. */
export async function getOfficialHoliday(
  boutiqueId: string,
  ymd: string
): Promise<OfficialHolidayInfo | null> {
  const row = await prisma.officialHoliday.findUnique({
    where: { boutiqueId_date: { boutiqueId, date: ymd } },
    select: { isClosed: true, name: true },
  });
  return row;
}

/**
 * Get event period covering this date. If multiple overlap, prefer one with forceWork=true.
 */
export async function getEventPeriod(
  boutiqueId: string,
  ymd: string
): Promise<EventPeriodInfo | null> {
  const periods = await prisma.eventPeriod.findMany({
    where: {
      boutiqueId,
      startDate: { lte: ymd },
      endDate: { gte: ymd },
    },
    select: { suspendWeeklyOff: true, forceWork: true, name: true },
    orderBy: { forceWork: 'desc' },
  });
  return periods[0] ?? null;
}

/** True if any event period covering this date has suspendWeeklyOff=true or forceWork=true. */
export async function shouldSuspendWeeklyOff(boutiqueId: string, ymd: string): Promise<boolean> {
  const period = await getEventPeriod(boutiqueId, ymd);
  return period ? period.suspendWeeklyOff || period.forceWork : false;
}

/** True if there is an official holiday on this date with isClosed=true. */
export async function isBoutiqueClosedHoliday(boutiqueId: string, ymd: string): Promise<boolean> {
  const holiday = await getOfficialHoliday(boutiqueId, ymd);
  return holiday?.isClosed === true;
}
