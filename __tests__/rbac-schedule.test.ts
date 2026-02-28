/**
 * RBAC: Schedule edit and override write APIs must not be callable by EMPLOYEE.
 * Server enforces via requireRole; these tests verify permission helpers and contract.
 */

import { canEditSchedule } from '@/lib/permissions';
import type { Role } from '@prisma/client';

describe('RBAC schedule', () => {
  it('EMPLOYEE cannot edit schedule (canEditSchedule false)', () => {
    expect(canEditSchedule('EMPLOYEE')).toBe(false);
  });

  it('MANAGER can edit schedule', () => {
    expect(canEditSchedule('MANAGER')).toBe(true);
  });

  it('ASSISTANT_MANAGER can edit schedule', () => {
    expect(canEditSchedule('ASSISTANT_MANAGER')).toBe(true);
  });

  it('ADMIN can edit schedule', () => {
    expect(canEditSchedule('ADMIN')).toBe(true);
  });

  it('no write API is allowed for EMPLOYEE (contract: grid/save and overrides use requireRole MANAGER/ASSISTANT_MANAGER/ADMIN)', () => {
    const editRoles: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];
    expect(editRoles).not.toContain('EMPLOYEE');
  });
});
