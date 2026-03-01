import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AreaEmployeesClient } from './AreaEmployeesClient';

export default async function AreaEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const role = user.role as string;
  if (role !== 'AREA_MANAGER' && role !== 'SUPER_ADMIN') {
    redirect('/');
  }
  return (
    <div className="min-h-screen bg-[#F8F4E8]">
      <AreaEmployeesClient />
    </div>
  );
}
