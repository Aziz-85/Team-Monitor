import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { RolePreviewCenterClient } from './RolePreviewCenterClient';

export default async function RolePreviewCenterPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  const [employees, boutiques] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true, isSystemOnly: false },
      select: {
        empId: true,
        name: true,
        nameAr: true,
        position: true,
        boutiqueId: true,
        user: { select: { role: true, disabled: true } },
        boutique: { select: { name: true, code: true } },
      },
      orderBy: [{ boutique: { code: 'asc' } }, { name: 'asc' }],
    }),
    prisma.boutique.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  return <RolePreviewCenterClient employees={employees} boutiques={boutiques} />;
}
