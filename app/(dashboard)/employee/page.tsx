import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { EmployeeHomeClient } from './EmployeeHomeClient';

export default async function EmployeeHomePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return <EmployeeHomeClient />;
}
