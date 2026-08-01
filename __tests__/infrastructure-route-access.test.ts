import { canAccessRoute } from '@/lib/routeMatrix';

describe('infrastructure dashboard route access', () => {
  it('allows SUPER_ADMIN to open the infrastructure dashboard', () => {
    expect(canAccessRoute('SUPER_ADMIN', '/admin/infrastructure')).toBe(true);
  });

  it('does not grant infrastructure dashboard access to ADMIN', () => {
    expect(canAccessRoute('ADMIN', '/admin/infrastructure')).toBe(false);
  });
});
