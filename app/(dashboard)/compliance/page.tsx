import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ComplianceClient } from './ComplianceClient';

export default async function CompliancePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <ComplianceClient />;
}
