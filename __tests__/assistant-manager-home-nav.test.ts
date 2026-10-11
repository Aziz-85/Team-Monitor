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
    const links = getSidebarGroupedSections('ASSISTANT_MANAGER', translate).flatMap(
      (section) => section.items
    );

    expect(links.find((item) => item.key === 'HOME')?.href).toBe('/employee');
    expect(links.some((item) => item.key === 'EMPLOYEE_HOME')).toBe(false);
  });
});
