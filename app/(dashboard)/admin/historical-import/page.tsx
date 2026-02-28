import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { HistoricalImportClient } from './HistoricalImportClient';

export default async function AdminHistoricalImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return (
    <div className="min-w-0">
      <HistoricalImportClient />
    </div>
  );
}
