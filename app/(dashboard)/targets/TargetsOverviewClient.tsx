'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';

const cards = [
  { href: '/targets/boutiques', key: 'boutiqueTargets' },
  { href: '/targets/employees', key: 'employeeTargets' },
  { href: '/targets/import', key: 'importExport' },
] as const;

export function TargetsOverviewClient() {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t('targetsManagement.title')}
        subtitle={t('targetsManagement.subtitle')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-subtle"
          >
            <span className="font-medium text-foreground">
              {t(`targetsManagement.${key}`)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
