import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { prisma } from '@/lib/db';
import { ImportSubpageLayout } from '@/components/admin/ImportSubpageLayout';
import { MonthSnapshotUploadClient } from './MonthSnapshotUploadClient';

export default async function AdminMonthlySnapshotPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const scope = await getOperationalScope();
  const boutiqueId = scope?.boutiqueId ?? user.boutiqueId ?? '';
  const defaultBranchCode =
    boutiqueId
      ? (await prisma.boutique.findUnique({ where: { id: boutiqueId }, select: { code: true } }))?.code ?? ''
      : '';

  return (
    <ImportSubpageLayout title="Monthly Snapshot">
      <MonthSnapshotUploadClient defaultBranchCode={defaultBranchCode} />
    </ImportSubpageLayout>
  );
}
