import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { getSessionUser } from '@/lib/auth';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

const ROLES: Role[] = ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }
  const user = await getSessionUser();
  if (!user?.boutiqueId) {
    return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  }
  const sessionBoutiqueId = user.boutiqueId;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') ?? undefined;
  const q = searchParams.get('q')?.trim();
  const boutiqueIds = [sessionBoutiqueId];

  type UserFilter = { userId: string } | { userId: { in: string[] } };
  let userFilter: UserFilter | undefined;
  if (userId) userFilter = { userId };
  else if (q) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { empId: { contains: q, mode: 'insensitive' } },
          { employee: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) userFilter = { userId: { in: ids } };
    else userFilter = { userId: { in: [] } }; // no match
  }

  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: {
      ...(userFilter ?? {}),
      boutiqueId: { in: boutiqueIds },
    },
    include: {
      user: { select: { id: true, empId: true, employee: { select: { name: true } } } },
      boutique: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ userId: 'asc' }, { boutiqueId: 'asc' }],
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      user: m.user,
      boutiqueId: m.boutiqueId,
      boutique: m.boutique,
      role: m.role,
      canAccess: m.canAccess,
      canManageTasks: m.canManageTasks,
      canManageLeaves: m.canManageLeaves,
      canManageSales: m.canManageSales,
      canManageInventory: m.canManageInventory,
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
  const userId = body.userId ? String(body.userId).trim() : '';
  const boutiqueId = body.boutiqueId ? String(body.boutiqueId).trim() : '';
  const role = body.role ? String(body.role).toUpperCase() : 'EMPLOYEE';
  const canAccess = body.canAccess !== undefined ? Boolean(body.canAccess) : true;
  const canManageTasks = body.canManageTasks !== undefined ? Boolean(body.canManageTasks) : false;
  const canManageLeaves = body.canManageLeaves !== undefined ? Boolean(body.canManageLeaves) : false;
  const canManageSales = body.canManageSales !== undefined ? Boolean(body.canManageSales) : false;
  const canManageInventory = body.canManageInventory !== undefined ? Boolean(body.canManageInventory) : false;

  if (!userId || !boutiqueId) {
    return NextResponse.json({ error: 'userId and boutiqueId required' }, { status: 400 });
  }
  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'role must be one of EMPLOYEE, MANAGER, ASSISTANT_MANAGER, ADMIN' }, { status: 400 });
  }

  const [userExists, boutiqueExists] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.boutique.findUnique({ where: { id: boutiqueId } }),
  ]);
  if (!userExists) return NextResponse.json({ error: 'User not found' }, { status: 400 });
  if (!boutiqueExists) return NextResponse.json({ error: 'Boutique not found' }, { status: 400 });

  const existing = await prisma.userBoutiqueMembership.findUnique({
    where: { userId_boutiqueId: { userId, boutiqueId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Membership already exists for this user and boutique' }, { status: 400 });
  }

  const created = await prisma.userBoutiqueMembership.create({
    data: { userId, boutiqueId, role: role as Role, canAccess, canManageTasks, canManageLeaves, canManageSales, canManageInventory },
    include: {
      user: { select: { empId: true } },
      boutique: { select: { code: true, name: true } },
    },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'MEMBERSHIP_CREATE',
    entityType: 'USER_BOUTIQUE_MEMBERSHIP',
    entityId: created.id,
    afterJson: JSON.stringify({ userId, boutiqueId, role: created.role, canAccess: created.canAccess, canManageTasks: created.canManageTasks, canManageLeaves: created.canManageLeaves, canManageSales: created.canManageSales, canManageInventory: created.canManageInventory }),
    boutiqueId: created.boutiqueId,
  });

  return NextResponse.json({
    id: created.id,
    userId: created.userId,
    boutiqueId: created.boutiqueId,
    role: created.role,
    canAccess: created.canAccess,
    canManageTasks: created.canManageTasks,
    canManageLeaves: created.canManageLeaves,
    canManageSales: created.canManageSales,
    canManageInventory: created.canManageInventory,
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

  const existing = await prisma.userBoutiqueMembership.findUnique({
    where: { id },
    include: { boutique: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  const role = body.role !== undefined ? String(body.role).toUpperCase() : undefined;
  const canAccess = body.canAccess !== undefined ? Boolean(body.canAccess) : undefined;
  const canManageTasks = body.canManageTasks !== undefined ? Boolean(body.canManageTasks) : undefined;
  const canManageLeaves = body.canManageLeaves !== undefined ? Boolean(body.canManageLeaves) : undefined;
  const canManageSales = body.canManageSales !== undefined ? Boolean(body.canManageSales) : undefined;
  const canManageInventory = body.canManageInventory !== undefined ? Boolean(body.canManageInventory) : undefined;

  if (role !== undefined && !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }

  const before = { role: existing.role, canAccess: existing.canAccess, canManageTasks: existing.canManageTasks, canManageLeaves: existing.canManageLeaves, canManageSales: existing.canManageSales, canManageInventory: existing.canManageInventory };
  const updated = await prisma.userBoutiqueMembership.update({
    where: { id },
    data: {
      ...(role !== undefined && { role: role as Role }),
      ...(canAccess !== undefined && { canAccess }),
      ...(canManageTasks !== undefined && { canManageTasks }),
      ...(canManageLeaves !== undefined && { canManageLeaves }),
      ...(canManageSales !== undefined && { canManageSales }),
      ...(canManageInventory !== undefined && { canManageInventory }),
    },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'MEMBERSHIP_UPDATE',
    entityType: 'USER_BOUTIQUE_MEMBERSHIP',
    entityId: id,
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify({ role: updated.role, canAccess: updated.canAccess, canManageTasks: updated.canManageTasks, canManageLeaves: updated.canManageLeaves, canManageSales: updated.canManageSales, canManageInventory: updated.canManageInventory }),
    boutiqueId: existing.boutiqueId,
  });

  return NextResponse.json({
    id: updated.id,
    userId: updated.userId,
    boutiqueId: updated.boutiqueId,
    role: updated.role,
    canAccess: updated.canAccess,
    canManageTasks: updated.canManageTasks,
    canManageLeaves: updated.canManageLeaves,
    canManageSales: updated.canManageSales,
    canManageInventory: updated.canManageInventory,
  });
}
