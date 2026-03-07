import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesMyClient } from './SalesMyClient';

export default async function SalesMyPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'EMPLOYEE') redirect('/');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <SalesMyClient />
    </div>
  );
}
