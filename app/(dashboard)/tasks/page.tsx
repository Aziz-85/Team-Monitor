import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { TasksPageClient } from './TasksPageClient';

export default async function TasksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <TasksPageClient role={user.role} />;
}
