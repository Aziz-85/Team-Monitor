'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';

export function AdminImportClient() {
  const { t } = useT();

  const IMPORT_CARDS: { href: string; titleKey: string; descKey: string }[] = [
    { href: '/admin/import/sales', titleKey: 'admin.import.salesImports', descKey: 'admin.import.salesImportsDesc' },
    { href: '/admin/import/monthly-snapshot', titleKey: 'admin.import.monthSnapshot', descKey: 'admin.import.monthSnapshotDesc' },
    { href: '/admin/import/historical', titleKey: 'admin.import.historicalImport', descKey: 'admin.import.historicalImportDesc' },
    { href: '/admin/import/issues', titleKey: 'admin.import.importIssues', descKey: 'admin.import.importIssuesDesc' },
    { href: '/admin/import/monthly-matrix', titleKey: 'admin.import.monthlyMatrix', descKey: 'admin.import.monthlyMatrixDesc' },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-foreground">{t('admin.import.title')}</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IMPORT_CARDS.map((card) => (
            <Link key={card.href} href={card.href}>
              <OpsCard className="h-full transition-colors hover:bg-surface-subtle">
                <h3 className="mb-1 text-sm font-medium text-foreground">{t(card.titleKey)}</h3>
                <p className="text-xs text-muted">{t(card.descKey)}</p>
              </OpsCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
