/**
 * Post-login landing paths: roles without `/` must not default to management home.
 */

import { getPostLoginPath } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

describe('getPostLoginPath', () => {
  const cases: Array<{ role: Role; expected: string }> = [
    { role: 'EMPLOYEE', expected: '/employee' },
    { role: 'ASSISTANT_MANAGER', expected: '/dashboard' },
    { role: 'DEMO_VIEWER', expected: '/dashboard' },
    { role: 'MANAGER', expected: '/' },
    { role: 'ADMIN', expected: '/' },
    { role: 'AREA_MANAGER', expected: '/' },
    { role: 'SUPER_ADMIN', expected: '/' },
  ];

  it.each(cases)('$role → $expected', ({ role, expected }) => {
    expect(getPostLoginPath(role)).toBe(expected);
  });
});
