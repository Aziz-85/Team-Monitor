import { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/jwt/mobileJwt';
import type { Role } from '@prisma/client';

export type MobileAuthUser = {
  userId: string;
  role: Role;
  boutiqueId: string;
};

/**
 * Parse Authorization: Bearer <accessToken>, verify JWT, return { userId, role, boutiqueId }.
 * Returns null if missing or invalid.
 */
export async function getMobileUserFromRequest(req: NextRequest): Promise<MobileAuthUser | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const payload = await verifyAccessToken(token);
    return {
      userId: payload.userId,
      role: payload.role,
      boutiqueId: payload.boutiqueId,
    };
  } catch {
    return null;
  }
}

/** Role -> permissions for mobile (for /api/mobile/me). */
export const MOBILE_PERMISSIONS_BY_ROLE: Record<Role, string[]> = {
  EMPLOYEE: ['schedule:view', 'tasks:own', 'inventory:own', 'leaves:request', 'target:own'],
  ASSISTANT_MANAGER: [
    'schedule:view',
    'schedule:edit',
    'tasks:own',
    'inventory:own',
    'leaves:request',
    'target:own',
  ],
  MANAGER: [
    'schedule:view',
    'schedule:edit',
    'tasks:manage',
    'inventory:manage',
    'leaves:manage',
    'target:manage',
    'sales:manage',
  ],
  SUPER_ADMIN: [
    'schedule:view',
    'schedule:edit',
    'tasks:manage',
    'inventory:manage',
    'leaves:manage',
    'target:manage',
    'sales:manage',
    'admin',
  ],
  ADMIN: [
    'schedule:view',
    'schedule:edit',
    'tasks:manage',
    'inventory:manage',
    'leaves:manage',
    'target:manage',
    'sales:manage',
    'admin:users',
    'admin:employees',
    'admin:coverage-rules',
    'admin:import',
    'admin:audit',
  ],
};
