import type { Role } from '@prisma/client';

export const PLATFORM_ACTIVE_MODES = ['BRANCH_MANAGER', 'PLATFORM_ADMIN'] as const;
export type PlatformActiveMode = (typeof PLATFORM_ACTIVE_MODES)[number];

export const PLATFORM_ADMIN_IDLE_MINUTES = 30;

export type EffectiveAccessContext = {
  userId: string;
  primaryRole: Role;
  effectiveRole: Role;
  isPlatformOwner: boolean;
  activeMode: PlatformActiveMode;
  primaryBoutiqueId: string;
  scopeBoutiqueId: string | null;
  globalScope: boolean;
};

export type SessionModeState = {
  id: string;
  activeMode: PlatformActiveMode;
  platformModeLastActiveAt: Date | null;
  lastSeenAt: Date;
};
