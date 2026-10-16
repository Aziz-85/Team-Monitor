import { canAccessRoute } from '@/lib/permissions';
import { getSidebarGroupedSections } from '@/lib/nav/sidebarShellNav';

describe('Assistant Manager home navigation', () => {
  const translate = (key: string) => key;

  it('allows the employee home route', () => {
    expect(canAccessRoute('ASSISTANT_MANAGER', '/employee')).toBe(true);
  });

  it('allows the team navigation branch that contains the schedule editor', () => {
    expect(canAccessRoute('ASSISTANT_MANAGER', '/nav/team')).toBe(true);
    expect(canAccessRoute('ASSISTANT_MANAGER', '/nav/team/schedule')).toBe(true);
    expect(canAccessRoute('ASSISTANT_MANAGER', '/schedule/edit')).toBe(true);
  });

  it('uses /employee for Home without rendering a duplicate employee-home link', () => {
    const sections = getSidebarGroupedSections('ASSISTANT_MANAGER', translate);
    const links = sections.flatMap(
      (section) => section.items
    );

    expect(links.find((item) => item.key === 'HOME')?.href).toBe('/employee');
    expect(links.some((item) => item.key === 'EMPLOYEE_HOME')).toBe(false);

    const team = links.find((item) => item.key === 'TEAM_HUB');
    expect(team?.children?.some((item) => item.href === '/schedule/edit')).toBe(true);
    expect(team?.children?.some((item) => item.href === '/schedule/view')).toBe(true);
    expect(team?.children?.some((item) => item.href === '/leaves')).toBe(true);
    expect(team?.children?.some((item) => item.href === '/approvals')).toBe(false);
    expect(team?.children?.some((item) => item.href === '/compliance')).toBe(false);
    expect(team?.children?.some((item) => item.href === '/nav/team/schedule')).toBe(false);

    const operations = links.find((item) => item.key === 'OPERATIONS_HUB');
    expect(operations?.children?.map((item) => item.href)).toEqual([
      '/tasks',
      '/inventory/daily',
      '/inventory/zones',
    ]);
  });

  it('does not expose management pages to employees through broad route prefixes', () => {
    const sections = getSidebarGroupedSections('EMPLOYEE', translate);
    const links = sections.flatMap((section) => section.items);

    const team = links.find((item) => item.key === 'TEAM_HUB');
    expect(team?.children?.map((item) => item.href)).toEqual(['/schedule/view']);

    const operations = links.find((item) => item.key === 'OPERATIONS_HUB');
    expect(operations?.children?.map((item) => item.href)).toEqual([
      '/tasks',
      '/inventory/daily',
      '/inventory/zones',
    ]);
  });

  it('shows login activity to administrators only', () => {
    const adminLinks = getSidebarGroupedSections('ADMIN', translate)
      .flatMap((section) => section.items)
      .find((item) => item.key === 'SYSTEM_HUB')?.children;
    const assistantLinks = getSidebarGroupedSections('ASSISTANT_MANAGER', translate)
      .flatMap((section) => section.items)
      .find((item) => item.key === 'SYSTEM_HUB')?.children;
    const employeeLinks = getSidebarGroupedSections('EMPLOYEE', translate)
      .flatMap((section) => section.items)
      .find((item) => item.key === 'SYSTEM_HUB')?.children;

    expect(adminLinks?.some((item) => item.href === '/admin/audit/login')).toBe(true);
    expect(assistantLinks?.some((item) => item.href === '/admin/audit/login')).toBe(false);
    expect(employeeLinks?.some((item) => item.href === '/admin/audit/login')).toBe(false);
  });

  it('shows the role preview center to administrators only', () => {
    const systemLinksFor = (role: Parameters<typeof getSidebarGroupedSections>[0]) =>
      getSidebarGroupedSections(role, translate)
        .flatMap((section) => section.items)
        .find((item) => item.key === 'SYSTEM_HUB')?.children;

    expect(systemLinksFor('ADMIN')?.some((item) => item.href === '/admin/role-preview')).toBe(true);
    expect(systemLinksFor('SUPER_ADMIN')?.some((item) => item.href === '/admin/role-preview')).toBe(true);
    expect(systemLinksFor('MANAGER')?.some((item) => item.href === '/admin/role-preview')).toBe(false);
    expect(systemLinksFor('AREA_MANAGER')?.some((item) => item.href === '/admin/role-preview')).toBe(false);
    expect(systemLinksFor('ASSISTANT_MANAGER')?.some((item) => item.href === '/admin/role-preview')).toBe(false);
    expect(systemLinksFor('EMPLOYEE')?.some((item) => item.href === '/admin/role-preview')).toBe(false);
  });

  it('limits the export center to boutique and platform leadership', () => {
    expect(canAccessRoute('EMPLOYEE', '/reports/export-center')).toBe(false);
    expect(canAccessRoute('ASSISTANT_MANAGER', '/reports/export-center')).toBe(false);
    expect(canAccessRoute('DEMO_VIEWER', '/reports/export-center')).toBe(false);
    expect(canAccessRoute('MANAGER', '/reports/export-center')).toBe(true);
    expect(canAccessRoute('AREA_MANAGER', '/reports/export-center')).toBe(true);
    expect(canAccessRoute('ADMIN', '/reports/export-center')).toBe(true);
    expect(canAccessRoute('SUPER_ADMIN', '/reports/export-center')).toBe(true);
  });
});
