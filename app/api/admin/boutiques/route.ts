import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { searchParams } = new URL(request.url);
  const regionId = searchParams.get('regionId') ?? undefined;
  const activeOnly = searchParams.get('active');
  const isActive = activeOnly === 'true' ? true : activeOnly === 'false' ? false : undefined;

  const boutiques = await prisma.boutique.findMany({
    where: {
      ...(regionId ? { regionId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: {
      region: { select: { id: true, code: true, name: true } },
      _count: { select: { userBoutiqueMemberships: true } },
    },
    orderBy: [{ code: 'asc' }],
  });

  return NextResponse.json(
    boutiques.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      regionId: b.regionId,
      region: b.region,
      isActive: b.isActive,
      membersCount: b._count.userBoutiqueMemberships,
    }))
  );
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();
  const regionId = body.regionId ? String(body.regionId).trim() : null;

  if (!name || !code) {
    return NextResponse.json({ error: 'name and code required' }, { status: 400 });
  }

  const existing = await prisma.boutique.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: 'Boutique code already exists' }, { status: 400 });
  }

  if (regionId) {
    const region = await prisma.region.findUnique({ where: { id: regionId } });
    if (!region) return NextResponse.json({ error: 'Region not found' }, { status: 400 });
  }

  const created = await prisma.boutique.create({
    data: { name, code, regionId, isActive: true },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'BOUTIQUE_CREATE',
    entityType: 'BOUTIQUE',
    entityId: created.id,
    afterJson: JSON.stringify({ code: created.code, name: created.name, regionId: created.regionId }),
  });

  return NextResponse.json({
    id: created.id,
    code: created.code,
    name: created.name,
    regionId: created.regionId,
    isActive: created.isActive,
  });
}
