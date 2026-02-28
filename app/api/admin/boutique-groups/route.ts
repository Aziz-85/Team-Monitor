import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const groups = await prisma.boutiqueGroup.findMany({
    include: {
      members: { include: { boutique: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: [{ name: 'asc' }],
  });

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      isActive: g.isActive,
      members: g.members.map((m) => ({ boutiqueId: m.boutiqueId, boutique: m.boutique })),
      membersCount: g.members.length,
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
  const code = body.code !== undefined && body.code !== null && body.code !== '' ? String(body.code).trim() : null;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  if (code) {
    const existing = await prisma.boutiqueGroup.findFirst({ where: { code } });
    if (existing) return NextResponse.json({ error: 'Group code already exists' }, { status: 400 });
  }

  const created = await prisma.boutiqueGroup.create({
    data: { name, code, isActive },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'GROUP_CREATE',
    entityType: 'BOUTIQUE_GROUP',
    entityId: created.id,
    afterJson: JSON.stringify({ name: created.name, code: created.code, isActive: created.isActive }),
  });

  return NextResponse.json({
    id: created.id,
    name: created.name,
    code: created.code,
    isActive: created.isActive,
  });
}

export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : null;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await prisma.boutiqueGroup.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const code = body.code !== undefined ? (body.code ? String(body.code).trim() : null) : undefined;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

  if (code !== undefined && code !== null && code !== existing.code) {
    const dup = await prisma.boutiqueGroup.findFirst({ where: { code } });
    if (dup) return NextResponse.json({ error: 'Group code already exists' }, { status: 400 });
  }

  const before = { name: existing.name, code: existing.code, isActive: existing.isActive };
  const updated = await prisma.boutiqueGroup.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  const action = isActive === false ? 'GROUP_DISABLE' : 'GROUP_UPDATE';
  await writeAdminAudit({
    actorUserId: user.id,
    action,
    entityType: 'BOUTIQUE_GROUP',
    entityId: id,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify({ name: updated.name, code: updated.code, isActive: updated.isActive }),
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    code: updated.code,
    isActive: updated.isActive,
  });
}
