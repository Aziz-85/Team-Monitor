import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { MonthlyBoardClient } from './MonthlyBoardClient';

export default async function ExecutiveMonthlyPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[#F8F4E8]">
      <MonthlyBoardClient />
    </div>
  );
}
