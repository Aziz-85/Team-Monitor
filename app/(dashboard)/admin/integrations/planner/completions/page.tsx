import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { PlannerCompletionsClient } from './PlannerCompletionsClient';

export default async function PlannerCompletionsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return <PlannerCompletionsClient />;
}

