/**
 * Shared filters for Employee queries so disabled users (User.disabled = true)
 * and SUPER_ADMIN (hidden from employee pages) are excluded from
 * schedule, tasks, zone assignment, leaves list, etc.
 */

import type { Role } from '@prisma/client';

/** Use in Employee findMany: only employees with no linked user OR (user not disabled AND user not SUPER_ADMIN). */
export const notDisabledUserWhere = {
  OR: [
    { user: { is: null } },
    { user: { disabled: false, role: { not: 'SUPER_ADMIN' as Role } } },
  ],
};
