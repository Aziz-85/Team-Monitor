import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { CompanyAlertsClient } from './CompanyAlertsClient';

export default async function CompanyAlertsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return <CompanyAlertsClient />;
}
