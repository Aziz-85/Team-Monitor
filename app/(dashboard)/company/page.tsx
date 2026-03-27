import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { CompanyOverviewClient } from './CompanyOverviewClient';

export default async function CompanyOverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return <CompanyOverviewClient />;
}
