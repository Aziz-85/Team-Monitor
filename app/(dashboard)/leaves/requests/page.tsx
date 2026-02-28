import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { LeaveRequestsClient } from './LeaveRequestsClient';

export default async function LeaveRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <LeaveRequestsClient />;
}
