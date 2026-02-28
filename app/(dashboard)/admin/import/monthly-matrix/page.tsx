import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ImportSubpageLayout } from '@/components/admin/ImportSubpageLayout';
import { MatrixImportClient } from '../MatrixImportClient';

export default async function AdminImportMonthlyMatrixPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  return (
    <ImportSubpageLayout title="Import — Monthly Matrix">
      <MatrixImportClient />
    </ImportSubpageLayout>
  );
}
