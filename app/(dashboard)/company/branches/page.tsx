import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { CompanyBranchesClient } from './CompanyBranchesClient';

export default async function CompanyBranchesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return <CompanyBranchesClient />;
}
