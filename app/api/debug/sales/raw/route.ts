/**
 * DB-RAW debug endpoint: proves DB truth for sales (ledger = BoutiqueSalesSummary + BoutiqueSalesLine).
 * ADMIN only; scope access enforced (scopeId must be in user's allowed boutiques).
 * Month filter: UTC boundaries (start = first day 00:00 UTC, endExclusive = first day of next month 00:00 UTC).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getMonthRange, normalizeMonthKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

type RawRow = {
  date: string;
  employeeId: string;
  salesSar: number;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireRole(['ADMIN']);
    const { searchParams } = new URL(request.url);
    const scopeId = searchParams.get('scopeId')?.trim();
    const month = searchParams.get('month')?.trim();

    if (!scopeId || !month) {
      return NextResponse.json(
        { error: 'Missing scopeId or month. Use ?scopeId=S02&month=YYYY-MM' },
        { status: 400 }
      );
    }

    const monthKey = normalizeMonthKey(month);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    const allowed = await prisma.userBoutiqueMembership.findMany({
      where: { userId: user.id, canAccess: true },
      include: { boutique: { select: { id: true, isActive: true } } },
    });
    const allowedBoutiqueIds = allowed.filter((m) => m.boutique.isActive).map((m) => m.boutiqueId);
    if (!allowedBoutiqueIds.includes(scopeId)) {
      return NextResponse.json({ error: 'Not allowed to view this scope' }, { status: 403 });
    }

    const { start, endExclusive } = getMonthRange(monthKey);
    const startUTC = start.toISOString();
    const endExclusiveUTC = endExclusive.toISOString();

    const summaries = await prisma.boutiqueSalesSummary.findMany({
      where: {
        boutiqueId: scopeId,
        date: { gte: start, lt: endExclusive },
      },
      include: {
        lines: {
          select: {
            employeeId: true,
            amountSar: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    const rows: RawRow[] = [];
    const distinctEmployeeIds = new Set<string>();
    for (const s of summaries) {
      const dateStr = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
      for (const line of s.lines) {
        distinctEmployeeIds.add(line.employeeId);
        rows.push({
          date: dateStr,
          employeeId: line.employeeId,
          salesSar: line.amountSar,
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        });
      }
    }

    const first50 = rows.slice(0, 50);

    return NextResponse.json({
      scopeId,
      month: monthKey,
      startUTC,
      endExclusiveUTC,
      count: rows.length,
      distinctEmployeeIds: Array.from(distinctEmployeeIds).sort(),
      first50,
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err?.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw e;
  }
}
