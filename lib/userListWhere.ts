/**
 * Shared Prisma where clause for user/employee list endpoints.
 * By default, SUPER_ADMIN is excluded from "employee" lists (UI + API).
 * Only when requester is SUPER_ADMIN and includeSuperAdmin=true may SUPER_ADMIN be included.
 */

import type { Prisma } from '@prisma/client';

export interface UserListWhereOptions {
  /** If false (default), exclude SUPER_ADMIN. If true, include all roles (only when requester is SUPER_ADMIN). */
  includeSuperAdmin: boolean;
}

/**
 * Returns a Prisma User where clause for list queries.
 * Use in findMany: where: { ...existingWhere, ...userListWhere(options) }
 */
export function userListWhere(options: UserListWhereOptions): Prisma.UserWhereInput {
  if (options.includeSuperAdmin) return {};
  return { role: { not: 'SUPER_ADMIN' } };
}
