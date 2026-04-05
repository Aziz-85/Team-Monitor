import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canUseSalesTestModule } from '@/lib/test-sales/access';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function optNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseSalesTestModule(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const dateKey = request.nextUrl.searchParams.get('dateKey')?.trim();
  if (!dateKey || !DATE_RE.test(dateKey)) {
    return NextResponse.json({ error: 'Invalid dateKey' }, { status: 400 });
  }

  const entry = await prisma.salesTestEntry.findUnique({
    where: { userId_dateKey: { userId: user.id, dateKey } },
    include: { employees: { orderBy: { sortOrder: 'asc' } }, branches: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json({ entry });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseSalesTestModule(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dateKey = typeof body.dateKey === 'string' ? body.dateKey.trim() : '';
  if (!dateKey || !DATE_RE.test(dateKey)) {
    return NextResponse.json({ error: 'Invalid dateKey' }, { status: 400 });
  }

  const boutiqueId = typeof body.boutiqueId === 'string' && body.boutiqueId ? body.boutiqueId.trim() : null;
  const boutiqueLabel = typeof body.boutiqueLabel === 'string' ? body.boutiqueLabel.trim() || null : null;

  if (boutiqueId) {
    const b = await prisma.boutique.findFirst({ where: { id: boutiqueId, isActive: true }, select: { id: true } });
    if (!b) return NextResponse.json({ error: 'Invalid boutique' }, { status: 400 });
  }

  const employeesRaw = Array.isArray(body.employees) ? body.employees : [];
  const branchesRaw = Array.isArray(body.branches) ? body.branches : [];

  const monthTrendJson =
    typeof body.monthTrendJson === 'string' && body.monthTrendJson.trim()
      ? body.monthTrendJson.trim()
      : null;

  try {
    JSON.parse(monthTrendJson ?? '[]');
  } catch {
    return NextResponse.json({ error: 'Invalid monthTrendJson' }, { status: 400 });
  }

  const employees = employeesRaw
    .map((row: unknown, i: number) => {
      const r = row as Record<string, unknown>;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name) return null;
      return {
        sortOrder: i,
        name,
        salesSar: num(r.salesSar, 0),
        targetSar: num(r.targetSar, 0),
      };
    })
    .filter(Boolean) as { sortOrder: number; name: string; salesSar: number; targetSar: number }[];

  const branches = branchesRaw
    .map((row: unknown, i: number) => {
      const r = row as Record<string, unknown>;
      const branchLabel = typeof r.branchLabel === 'string' ? r.branchLabel.trim() : '';
      if (!branchLabel) return null;
      return {
        sortOrder: i,
        branchLabel,
        salesSar: num(r.salesSar, 0),
        targetSar: num(r.targetSar, 0),
      };
    })
    .filter(Boolean) as { sortOrder: number; branchLabel: string; salesSar: number; targetSar: number }[];

  const entry = await prisma.$transaction(async (tx) => {
    const data = {
      userId: user.id,
      dateKey,
      boutiqueId,
      boutiqueLabel,
      todaySalesSar: num(body.todaySalesSar, 0),
      dailyTargetSar: num(body.dailyTargetSar, 0),
      mtdSalesSar: num(body.mtdSalesSar, 0),
      mtdTargetSar: num(body.mtdTargetSar, 0),
      visitors: optNum(body.visitors),
      transactions: optNum(body.transactions),
      stockAvailabilityPct: optNum(body.stockAvailabilityPct),
      campaignActive: Boolean(body.campaignActive),
      campaignNotes: typeof body.campaignNotes === 'string' ? body.campaignNotes.trim() || null : null,
      yesterdaySalesSar: optNum(body.yesterdaySalesSar),
      sameDayLastWeekSalesSar: optNum(body.sameDayLastWeekSalesSar),
      lastMonthMtdSalesSar: optNum(body.lastMonthMtdSalesSar),
      timePatternNote: typeof body.timePatternNote === 'string' ? body.timePatternNote.trim() || null : null,
      promotionImpactNote:
        typeof body.promotionImpactNote === 'string' ? body.promotionImpactNote.trim() || null : null,
      monthTrendJson: monthTrendJson ?? null,
    };

    const { userId: _u, dateKey: _d, ...updateFields } = data;
    void _u;
    void _d;

    const upserted = await tx.salesTestEntry.upsert({
      where: { userId_dateKey: { userId: user.id, dateKey } },
      create: data,
      update: updateFields,
    });

    await tx.salesTestEmployeeLine.deleteMany({ where: { entryId: upserted.id } });
    await tx.salesTestBranchLine.deleteMany({ where: { entryId: upserted.id } });
    if (employees.length) {
      await tx.salesTestEmployeeLine.createMany({
        data: employees.map((e) => ({ ...e, entryId: upserted.id })),
      });
    }
    if (branches.length) {
      await tx.salesTestBranchLine.createMany({
        data: branches.map((b) => ({ ...b, entryId: upserted.id })),
      });
    }

    return tx.salesTestEntry.findUniqueOrThrow({
      where: { id: upserted.id },
      include: { employees: { orderBy: { sortOrder: 'asc' } }, branches: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  return NextResponse.json({ entry });
}
