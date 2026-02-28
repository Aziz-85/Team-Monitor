import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toRiyadhDateOnly, toRiyadhDateString, formatDateRiyadh, formatMonthKey, getRiyadhNow, getMonthRange, getDaysInMonth, normalizeMonthKey } from '@/lib/time';
import { canEditSalesForDate, canEditSalesForDateWithGrant } from '@/lib/sales-targets';
import { resolveMetricsScope } from '@/lib/metrics/scope';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await resolveMetricsScope(request);
  const boutiqueId = scope?.effectiveBoutiqueId ?? (user as { boutiqueId?: string }).boutiqueId ?? null;
  const whereBase = boutiqueId
    ? { userId: user.id, boutiqueId }
    : { userId: user.id };

  const rawMonth = request.nextUrl.searchParams.get('month')?.trim();
  const monthKey = rawMonth ? normalizeMonthKey(rawMonth) : '';
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    const { start, endExclusive } = getMonthRange(monthKey);
    const now = new Date();
    const [entries, grants] = await Promise.all([
      prisma.salesEntry.findMany({
        where: { ...whereBase, month: monthKey },
        orderBy: { dateKey: 'asc' },
        select: { id: true, date: true, dateKey: true, amount: true },
      }),
      prisma.salesEditGrant.findMany({
        where: {
          userId: user.id,
          date: { gte: start, lt: endExclusive },
          expiresAt: { gt: now },
        },
        select: { date: true },
      }),
    ]);
    const grantDateSet = new Set(grants.map((g) => toRiyadhDateString(g.date)));
    const withDateStr = entries.map((e) => {
      const dateStr = e.dateKey ?? toRiyadhDateString(e.date);
      const canEdit =
        canEditSalesForDate(user.role, dateStr) || grantDateSet.has(dateStr);
      return { id: e.id, date: dateStr, amount: e.amount, canEdit };
    });
    const daysInMonth = getDaysInMonth(monthKey);
    const [y, m] = monthKey.split('-').map(Number);
    const canEditDates: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (canEditSalesForDate(user.role, dateStr) || grantDateSet.has(dateStr)) {
        canEditDates.push(dateStr);
      }
    }
    return NextResponse.json({ mode: 'month', monthKey, entries: withDateStr, canEditDates });
  }

  const days = Math.min(31, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 7));
  const now = getRiyadhNow();
  const today = toRiyadhDateOnly(now);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const entries = await prisma.salesEntry.findMany({
    where: { ...whereBase, date: { gte: from, lte: today } },
    orderBy: { date: 'desc' },
    select: { id: true, date: true, amount: true },
  });
  const withDateStr = await Promise.all(
    entries.map(async (e) => {
      const dateStr = toRiyadhDateString(e.date);
      const canEdit = await canEditSalesForDateWithGrant(prisma, user, dateStr);
      return { id: e.id, date: dateStr, amount: e.amount, canEdit };
    })
  );
  return NextResponse.json({ entries: withDateStr });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { date?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const dateStr = typeof body.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const canEdit = await canEditSalesForDateWithGrant(prisma, user, dateStr);
  if (!canEdit) {
    return NextResponse.json(
      { error: 'You can only enter sales for today or yesterday, or with an approved edit grant' },
      { status: 403 }
    );
  }
  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount)
    ? Math.round(body.amount)
    : Number(body.amount);
  if (amount < 0) {
    return NextResponse.json({ error: 'amount must be >= 0' }, { status: 400 });
  }

  const dateNorm = toRiyadhDateOnly(new Date(dateStr + 'T12:00:00.000Z'));
  const dateKey = formatDateRiyadh(dateNorm);
  const month = formatMonthKey(dateNorm);

  const scope = await resolveMetricsScope(request);
  const employeeBoutiqueId = scope?.effectiveBoutiqueId ?? (user as { boutiqueId?: string }).boutiqueId;
  if (!employeeBoutiqueId) {
    return NextResponse.json(
      { error: 'Your account is not linked to an employee boutique' },
      { status: 403 }
    );
  }

  const entry = await prisma.salesEntry.upsert({
    where: {
      boutiqueId_dateKey_userId: {
        boutiqueId: employeeBoutiqueId,
        dateKey,
        userId: user.id,
      },
    },
    create: {
      date: dateNorm,
      dateKey,
      month,
      userId: user.id,
      amount,
      boutiqueId: employeeBoutiqueId,
      source: 'MANUAL',
      createdById: user.id,
    },
    update: {
      amount,
      source: 'MANUAL',
      updatedAt: new Date(),
    },
  });
  return NextResponse.json(entry);
}

/** DELETE: clear all sales entries for the current user in the given month. Query: month=YYYY-MM. Not allowed for current month. */
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const currentMonthKey = formatMonthKey(getRiyadhNow());
  if (month === currentMonthKey) {
    return NextResponse.json(
      { error: 'Cannot delete entries for the current month' },
      { status: 403 }
    );
  }

  const scope = await resolveMetricsScope(request);
  const boutiqueId = scope?.effectiveBoutiqueId ?? (user as { boutiqueId?: string }).boutiqueId ?? null;
  const whereDelete = boutiqueId
    ? { userId: user.id, month, boutiqueId }
    : { userId: user.id, month };

  const result = await prisma.salesEntry.deleteMany({
    where: whereDelete,
  });
  return NextResponse.json({ ok: true, deletedCount: result.count });
}
