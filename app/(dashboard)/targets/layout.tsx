import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

const ALLOWED_ROLES = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export default async function TargetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ALLOWED_ROLES.includes(user.role)) redirect('/');

  return <>{children}</>;
}
