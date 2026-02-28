import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toRiyadhDateOnly } from '@/lib/time';
import { canEditSalesForDate } from '@/lib/sales-targets';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { date?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const dateStr = typeof body.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  if (canEditSalesForDate(user.role, dateStr)) {
    return NextResponse.json(
      { error: 'No need to request edit for today or yesterday' },
      { status: 400 }
    );
  }

  const dateOnly = toRiyadhDateOnly(new Date(dateStr + 'T12:00:00.000Z'));
  const note = typeof body.note === 'string' ? body.note.trim() || undefined : undefined;

  await prisma.approvalRequest.create({
    data: {
      module: 'SALES',
      actionType: 'EDIT_SALES_DAY',
      payload: { date: dateStr, note } as object,
      status: 'PENDING',
      requestedByUserId: user.id,
      effectiveDate: dateOnly,
    },
  });

  return NextResponse.json({ ok: true });
}
