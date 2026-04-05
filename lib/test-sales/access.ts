import type { Role } from '@prisma/client';

export function canUseSalesTestModule(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
