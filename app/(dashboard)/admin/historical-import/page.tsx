import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import { HistoricalImportClient } from './HistoricalImportClient';

export default async function AdminHistoricalImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') redirect('/');

  const t = await getTranslations('admin.importCenter');

  return (
    <div className="min-w-0">
      <div className="border-b border-border bg-surface-subtle px-4 py-2 text-center text-xs text-muted">
        <Link href="/admin/import-center?focus=historical" className="font-medium text-foreground underline">
          {t('historicalPageBannerLink')}
        </Link>
        {' — '}
        {t('historicalPageBanner')}
      </div>
      <HistoricalImportClient />
    </div>
  );
}
