import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id } = await params;
  const boutique = await prisma.boutique.findUnique({
    where: { id },
    include: {
      region: { select: { id: true, code: true, name: true } },
      _count: { select: { userBoutiqueMemberships: true } },
    },
  });
  if (!boutique) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });

  return NextResponse.json({
    id: boutique.id,
    code: boutique.code,
    name: boutique.name,
    regionId: boutique.regionId,
    region: boutique.region,
    isActive: boutique.isActive,
    membersCount: boutique._count.userBoutiqueMemberships,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id } = await params;
  const existing = await prisma.boutique.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : undefined;
  const regionId = body.regionId !== undefined ? (body.regionId ? String(body.regionId).trim() : null) : undefined;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

  if (code !== undefined && code !== existing.code) {
    const dup = await prisma.boutique.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: 'Boutique code already exists' }, { status: 400 });
  }
  if (regionId !== undefined && regionId) {
    const region = await prisma.region.findUnique({ where: { id: regionId } });
    if (!region) return NextResponse.json({ error: 'Region not found' }, { status: 400 });
  }

  const before = { name: existing.name, code: existing.code, regionId: existing.regionId, isActive: existing.isActive };
  const updated = await prisma.boutique.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code }),
      ...(regionId !== undefined && { regionId }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  const action = isActive === false ? 'BOUTIQUE_DISABLE' : 'BOUTIQUE_UPDATE';
  await writeAdminAudit({
    actorUserId: user.id,
    action,
    entityType: 'BOUTIQUE',
    entityId: id,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify({ name: updated.name, code: updated.code, regionId: updated.regionId, isActive: updated.isActive }),
    boutiqueId: id,
  });

  return NextResponse.json({
    id: updated.id,
    code: updated.code,
    name: updated.name,
    regionId: updated.regionId,
    isActive: updated.isActive,
  });
}
