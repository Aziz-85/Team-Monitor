import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SalesReturnsClient } from './SalesReturnsClient';

export default async function SalesReturnsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <SalesReturnsClient />
    </div>
  );
}
