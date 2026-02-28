import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toRiyadhDateString, getMonthRange, normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const monthKey = request.nextUrl.searchParams.get('month')?.trim();
  const normalized = monthKey ? normalizeMonthKey(monthKey) : '';
  if (!normalized || !/^\d{4}-\d{2}$/.test(normalized)) {
    return NextResponse.json({ error: 'month=YYYY-MM required' }, { status: 400 });
  }

  const { start, endExclusive } = getMonthRange(normalized);

  const list = await prisma.approvalRequest.findMany({
    where: {
      requestedByUserId: user.id,
      module: 'SALES',
      actionType: 'EDIT_SALES_DAY',
      status: 'PENDING',
      effectiveDate: { gte: start, lt: endExclusive },
    },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, effectiveDate: true, payload: true, requestedAt: true },
  });

  const requests = list.map((r) => ({
    id: r.id,
    date: r.effectiveDate ? toRiyadhDateString(r.effectiveDate) : null,
    note: (r.payload as { note?: string })?.note ?? null,
    requestedAt: r.requestedAt.toISOString(),
  }));

  return NextResponse.json({ monthKey: normalized, requests });
}
