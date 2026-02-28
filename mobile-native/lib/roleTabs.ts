import type { Role } from '@/types/api';

/**
 * Tab name -> which roles can see it.
 */
export const TAB_ROLES: Record<string, Role[]> = {
  index: ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'],
  team: ['ASSISTANT_MANAGER', 'MANAGER'],
  tasks: ['EMPLOYEE', 'ASSISTANT_MANAGER'],
  schedule: ['EMPLOYEE', 'ASSISTANT_MANAGER'],
  targets: ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'],
  reports: ['MANAGER', 'ADMIN'],
  boutiques: ['ADMIN'],
  users: ['ADMIN'],
  control: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'],
  notifications: ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'],
  settings: ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN'],
};

export function canSeeTab(role: Role, tabName: string): boolean {
  const roles = TAB_ROLES[tabName];
  return roles ? roles.includes(role) : false;
}
