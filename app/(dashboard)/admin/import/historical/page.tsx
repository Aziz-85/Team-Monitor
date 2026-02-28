import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ImportSubpageLayout } from '@/components/admin/ImportSubpageLayout';
import { HistoricalImportClient } from '@/app/(dashboard)/admin/historical-import/HistoricalImportClient';

export default async function AdminImportHistoricalPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return (
    <ImportSubpageLayout title="Historical Import">
      <HistoricalImportClient />
    </ImportSubpageLayout>
  );
}
