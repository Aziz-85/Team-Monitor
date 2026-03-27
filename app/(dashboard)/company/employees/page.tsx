import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { CompanyEmployeesClient } from './CompanyEmployeesClient';

export default async function CompanyEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return <CompanyEmployeesClient />;
}
