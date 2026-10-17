import { prisma } from '@/lib/db';

const LEADERSHIP_ROLES = ['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

export async function notifyUsers(input: {
  userIds: string[];
  title: string;
  body?: string;
  linkPath?: string;
}) {
  const userIds = Array.from(new Set(input.userIds)).filter(Boolean);
  if (!userIds.length) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    })),
  });
}

export async function getLeadershipUserIdsForBoutique(boutiqueId: string, excludeUserId?: string) {
  const users = await prisma.user.findMany({
    where: {
      disabled: false,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      role: { in: [...LEADERSHIP_ROLES] },
      OR: [
        { boutiqueId },
        { boutiqueMemberships: { some: { boutiqueId, canAccess: true } } },
        { role: 'SUPER_ADMIN' },
      ],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function getActiveBoutiqueUserIds(boutiqueId: string) {
  const users = await prisma.user.findMany({
    where: {
      disabled: false,
      OR: [
        { boutiqueId },
        { boutiqueMemberships: { some: { boutiqueId, canAccess: true } } },
      ],
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}
