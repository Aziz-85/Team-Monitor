/**
 * POST /api/admin/boutiques/bootstrap — ADMIN only. Create boutique + optional manager + optional init. Audited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

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
  const managerUserId = body.managerUserId ? String(body.managerUserId).trim() : null;
  const canManageSales = body.canManageSales !== undefined ? Boolean(body.canManageSales) : true;
  const canManageTasks = body.canManageTasks !== undefined ? Boolean(body.canManageTasks) : true;
  const canManageLeaves = body.canManageLeaves !== undefined ? Boolean(body.canManageLeaves) : true;
  const createCurrentMonthTarget = Boolean(body.createCurrentMonthTarget);
  const monthTargetAmount = typeof body.monthTargetAmount === 'number' ? body.monthTargetAmount : (body.monthTargetAmount != null ? parseInt(String(body.monthTargetAmount), 10) : 0);
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

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

  const boutique = await prisma.boutique.create({
    data: { name, code, regionId, isActive },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'BOUTIQUE_CREATE',
    entityType: 'BOUTIQUE',
    entityId: boutique.id,
    afterJson: JSON.stringify({ code: boutique.code, name: boutique.name, regionId: boutique.regionId }),
    boutiqueId: boutique.id,
  });

  let membershipId: string | null = null;
  if (managerUserId) {
    const managerUser = await prisma.user.findUnique({ where: { id: managerUserId } });
    if (!managerUser) {
      return NextResponse.json({ error: 'Manager user not found' }, { status: 400 });
    }
    const existingMembership = await prisma.userBoutiqueMembership.findUnique({
      where: { userId_boutiqueId: { userId: managerUserId, boutiqueId: boutique.id } },
    });
    if (!existingMembership) {
      const m = await prisma.userBoutiqueMembership.create({
        data: {
          userId: managerUserId,
          boutiqueId: boutique.id,
          role: 'MANAGER' as Role,
          canAccess: true,
          canManageTasks,
          canManageLeaves,
          canManageSales,
          canManageInventory: false,
        },
      });
      membershipId = m.id;
      await writeAdminAudit({
        actorUserId: user.id,
        action: 'BOUTIQUE_MANAGER_ASSIGNED',
        entityType: 'USER_BOUTIQUE_MEMBERSHIP',
        entityId: m.id,
        afterJson: JSON.stringify({ userId: managerUserId, boutiqueId: boutique.id, role: 'MANAGER', canManageTasks, canManageLeaves, canManageSales }),
        boutiqueId: boutique.id,
      });
    }
  }

  let targetId: string | null = null;
  if (createCurrentMonthTarget) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existingTarget = await prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, boutiqueId: boutique.id },
    });
    if (!existingTarget) {
      const t = await prisma.boutiqueMonthlyTarget.create({
        data: { boutiqueId: boutique.id, month: monthKey, amount: Math.max(0, monthTargetAmount), createdById: user.id },
      });
      targetId = t.id;
    }
  }

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'BOUTIQUE_BOOTSTRAPPED',
    entityType: 'BOUTIQUE',
    entityId: boutique.id,
    afterJson: JSON.stringify({ boutiqueId: boutique.id, managerAssigned: !!membershipId, currentMonthTarget: !!targetId }),
    boutiqueId: boutique.id,
  });

  return NextResponse.json({
    boutique: { id: boutique.id, code: boutique.code, name: boutique.name, regionId: boutique.regionId, isActive: boutique.isActive },
    managerMembershipId: membershipId,
    currentMonthTargetCreated: !!targetId,
  });
}
