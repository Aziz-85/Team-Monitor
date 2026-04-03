import type { Role } from '@prisma/client';

/** Full admin targets UI at `/targets` (boutique + employee management, same as former `/admin/targets`). */
export const ADMIN_TARGETS_PAGE_ROLES: readonly Role[] = [
  'MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
  'AREA_MANAGER',
] as const;
