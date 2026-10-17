import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getRolePreviewCookieName } from '@/lib/env/cookies';
import type { SessionUser } from '@/lib/auth';

const PREVIEW_ROLES = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'AREA_MANAGER'] as const;
export type PreviewRole = (typeof PREVIEW_ROLES)[number];
export type RolePreviewConfig = { targetUserId: string; role: PreviewRole; boutiqueIds: string[] };

export type RolePreviewState = {
  actorUserId: string;
  targetUserId: string;
  targetName: string;
  targetRole: SessionUser['role'];
  boutiqueIds: string[];
};

export function isRolePreviewEnabled() {
  return process.env.ROLE_PREVIEW_ENABLED === 'true';
}

export function encodeRolePreviewConfig(config: RolePreviewConfig) {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
}

export async function getRolePreviewConfig(): Promise<RolePreviewConfig | null> {
  if (!isRolePreviewEnabled()) return null;
  const raw = (await cookies()).get(getRolePreviewCookieName())?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<RolePreviewConfig>;
    if (typeof parsed.targetUserId !== 'string' || !PREVIEW_ROLES.includes(parsed.role as PreviewRole)) return null;
    const boutiqueIds = Array.isArray(parsed.boutiqueIds) ? parsed.boutiqueIds.filter((id): id is string => typeof id === 'string').slice(0, 20) : [];
    return { targetUserId: parsed.targetUserId, role: parsed.role as PreviewRole, boutiqueIds };
  } catch {
    return null;
  }
}

export async function applyRolePreview(baseUser: SessionUser): Promise<{ user: SessionUser; preview: RolePreviewState | null }> {
  if (!isRolePreviewEnabled() || (baseUser.role !== 'ADMIN' && baseUser.role !== 'SUPER_ADMIN')) {
    return { user: baseUser, preview: null };
  }

  const config = await getRolePreviewConfig();
  if (!config) return { user: baseUser, preview: null };

  const target = await prisma.user.findFirst({
    where: { id: config.targetUserId, disabled: false },
    include: {
      employee: { select: { name: true, language: true, position: true } },
      boutique: { select: { id: true, name: true, code: true } },
    },
  });
  if (!target) return { user: baseUser, preview: null };

  const user = { ...target, role: config.role, boutiqueId: config.boutiqueIds[0] ?? target.boutiqueId } as SessionUser;
  return {
    user,
    preview: {
      actorUserId: baseUser.id,
      targetUserId: target.id,
      targetName: target.employee?.name ?? target.empId,
      targetRole: config.role,
      boutiqueIds: config.boutiqueIds,
    },
  };
}
