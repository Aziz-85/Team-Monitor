import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesSummaryClient } from './SalesSummaryClient';

export default async function SalesSummaryPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) redirect('/');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <SalesSummaryClient />
    </div>
  );
}
