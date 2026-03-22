import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { ImportSubpageLayout } from '@/components/admin/ImportSubpageLayout';
import { HistoricalImportClient } from '@/app/(dashboard)/admin/historical-import/HistoricalImportClient';

export default async function AdminImportHistoricalPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  const t = await getTranslations('admin.importCenter');

  return (
    <ImportSubpageLayout title="Historical Import">
      <div className="mb-4 rounded border border-border bg-surface-subtle px-3 py-2 text-center text-xs text-muted">
        <Link href="/admin/import-center?focus=historical" className="font-medium text-foreground underline">
          {t('historicalPageBannerLink')}
        </Link>
        {' — '}
        {t('historicalPageBanner')}
      </div>
      <HistoricalImportClient />
    </ImportSubpageLayout>
  );
}
