import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { TaskSetupClient } from './TaskSetupClient';

export default async function TaskSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'EMPLOYEE' || user.role === 'ASSISTANT_MANAGER') redirect('/employee');

  return <TaskSetupClient />;
}
