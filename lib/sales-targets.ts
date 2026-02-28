import type { PrismaClient, Role } from '@prisma/client';
import { toRiyadhDateOnly, toRiyadhDateString, getRiyadhNow } from '@/lib/time';

/** User can create/update/delete sales only for today and yesterday (Riyadh). Manager/Admin can for any date. Sync version; does not check SalesEditGrant. */
export function canEditSalesForDate(role: Role, dateStr: string): boolean {
  if (role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  const now = getRiyadhNow();
  const today = toRiyadhDateString(now);
  const todayOnly = toRiyadhDateOnly(now);
  const yesterdayDate = new Date(todayOnly);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = toRiyadhDateString(yesterdayDate);
  return dateStr === today || dateStr === yesterday;
}

/** Full policy: today/yesterday or an active SalesEditGrant. Use in API. */
export async function canEditSalesForDateWithGrant(
  prisma: PrismaClient,
  user: { id: string; role: Role },
  dateStr: string
): Promise<boolean> {
  if (user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
  if (canEditSalesForDate(user.role, dateStr)) return true;
  const dateOnly = toRiyadhDateOnly(new Date(dateStr + 'T12:00:00.000Z'));
  const now = new Date();
  const grant = await prisma.salesEditGrant.findUnique({
    where: { userId_date: { userId: user.id, date: dateOnly } },
  });
  return grant != null && grant.expiresAt > now;
}
