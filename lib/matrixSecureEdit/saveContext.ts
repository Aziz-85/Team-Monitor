import { prisma } from '@/lib/db';
import { monthDaysUTC } from '@/lib/dates/safeCalendar';

/** Users allowed in matrix edits for this boutique + month (active employees + anyone with SalesEntry rows). */
export async function loadAllowedUserIdsForMatrixMonth(
  boutiqueId: string,
  month: string
): Promise<Set<string>> {
  const allowedUserIds = new Set(
    (
      await prisma.user.findMany({
        where: {
          disabled: false,
          employee: { boutiqueId, isSystemOnly: false, active: true },
        },
        select: { id: true },
      })
    ).map((u) => u.id)
  );
  const extraUserIds = await prisma.salesEntry.findMany({
    where: { boutiqueId, month },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const r of extraUserIds) allowedUserIds.add(r.userId);
  return allowedUserIds;
}

export function monthDayKeys(month: string): Set<string> {
  return new Set(monthDaysUTC(month));
}
