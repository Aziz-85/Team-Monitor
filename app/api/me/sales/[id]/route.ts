import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toRiyadhDateString, formatMonthKey, getRiyadhNow } from '@/lib/time';
import { canEditSalesForDate } from '@/lib/sales-targets';
import { getEmployeeBoutiqueIdForUser } from '@/lib/boutique/resolveOperationalBoutique';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.salesEntry.findFirst({
    where: { id, userId: user.id },
    select: { id: true, date: true, boutiqueId: true, month: true },
  });
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentMonthKey = formatMonthKey(getRiyadhNow());
  if (entry.month === currentMonthKey) {
    return NextResponse.json(
      { error: 'Cannot delete entries for the current month' },
      { status: 403 }
    );
  }

  const employeeBoutiqueId = await getEmployeeBoutiqueIdForUser(user.id);
  if (employeeBoutiqueId != null && entry.boutiqueId != null && entry.boutiqueId !== employeeBoutiqueId) {
    return NextResponse.json({ error: 'Entry belongs to another boutique' }, { status: 403 });
  }

  const dateStr = toRiyadhDateString(entry.date);
  if (!canEditSalesForDate(user.role as import('@prisma/client').Role, dateStr)) {
    return NextResponse.json({ error: 'You can only delete sales for today or yesterday' }, { status: 403 });
  }

  await prisma.salesEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
