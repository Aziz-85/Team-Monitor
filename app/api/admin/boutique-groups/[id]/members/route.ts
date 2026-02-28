import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id: groupId } = await params;
  const group = await prisma.boutiqueGroup.findUnique({
    where: { id: groupId },
    include: { members: { select: { boutiqueId: true } } },
  });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const addBoutiqueIds = Array.isArray(body.add) ? body.add.filter((x: unknown) => typeof x === 'string') as string[] : [];
  const removeBoutiqueIds = Array.isArray(body.remove) ? body.remove.filter((x: unknown) => typeof x === 'string') as string[] : [];

  const currentIds = new Set(group.members.map((m) => m.boutiqueId));
  const toAdd = addBoutiqueIds.filter((bid) => !currentIds.has(bid));
  const toRemove = removeBoutiqueIds.filter((bid) => currentIds.has(bid));

  for (const boutiqueId of toAdd) {
    const boutique = await prisma.boutique.findUnique({ where: { id: boutiqueId } });
    if (!boutique) return NextResponse.json({ error: `Boutique ${boutiqueId} not found` }, { status: 400 });
  }

  if (toAdd.length > 0) {
    await prisma.boutiqueGroupMember.createMany({
      data: toAdd.map((boutiqueId) => ({ boutiqueGroupId: groupId, boutiqueId })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length > 0) {
    await prisma.boutiqueGroupMember.deleteMany({
      where: { boutiqueGroupId: groupId, boutiqueId: { in: toRemove } },
    });
  }

  const afterMembers = await prisma.boutiqueGroupMember.findMany({
    where: { boutiqueGroupId: groupId },
    select: { boutiqueId: true },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'GROUP_MEMBERS_UPDATE',
    entityType: 'BOUTIQUE_GROUP',
    entityId: groupId,
    afterJson: JSON.stringify({ add: toAdd, remove: toRemove, memberIds: afterMembers.map((m) => m.boutiqueId) }),
  });

  return NextResponse.json({
    added: toAdd.length,
    removed: toRemove.length,
    memberCount: afterMembers.length,
  });
}
