import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { TasksMonitorClient } from './TasksMonitorClient';

export default async function TasksMonitorPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role === 'EMPLOYEE' || user.role === 'ASSISTANT_MANAGER') redirect('/employee');

  return <TasksMonitorClient />;
}
