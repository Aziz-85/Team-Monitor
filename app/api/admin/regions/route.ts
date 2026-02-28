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

  const regions = await prisma.region.findMany({
    include: {
      organization: { select: { id: true, code: true, name: true } },
      _count: { select: { boutiques: true } },
    },
    orderBy: [{ code: 'asc' }],
  });

  return NextResponse.json(
    regions.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      organizationId: r.organizationId,
      organization: r.organization,
      boutiquesCount: r._count.boutiques,
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
  const organizationId = body.organizationId ? String(body.organizationId).trim() : null;

  if (!name || !code) {
    return NextResponse.json({ error: 'name and code required' }, { status: 400 });
  }

  let orgId = organizationId;
  if (!orgId) {
    const first = await prisma.organization.findFirst({ select: { id: true } });
    if (!first) return NextResponse.json({ error: 'No organization found; provide organizationId' }, { status: 400 });
    orgId = first.id;
  } else {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
  }

  const existing = await prisma.region.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: 'Region code already exists' }, { status: 400 });
  }

  const created = await prisma.region.create({
    data: { name, code, organizationId: orgId },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'REGION_CREATE',
    entityType: 'REGION',
    entityId: created.id,
    afterJson: JSON.stringify({ code: created.code, name: created.name, organizationId: created.organizationId }),
  });

  return NextResponse.json({
    id: created.id,
    code: created.code,
    name: created.name,
    organizationId: created.organizationId,
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

  const existing = await prisma.region.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Region not found' }, { status: 404 });

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : undefined;

  if (code !== undefined && code !== existing.code) {
    const dup = await prisma.region.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: 'Region code already exists' }, { status: 400 });
  }

  const before = { name: existing.name, code: existing.code };
  const updated = await prisma.region.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code }),
    },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'REGION_UPDATE',
    entityType: 'REGION',
    entityId: id,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify({ name: updated.name, code: updated.code }),
  });

  return NextResponse.json({
    id: updated.id,
    code: updated.code,
    name: updated.name,
    organizationId: updated.organizationId,
  });
}
