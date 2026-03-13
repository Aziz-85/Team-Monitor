import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canViewCompliance } from '@/lib/permissions';
import { ComplianceClient } from './ComplianceClient';

export default async function CompliancePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canViewCompliance(user.role)) redirect('/');

  return <ComplianceClient />;
}
