'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { CompanyPageHeader } from '@/components/company/CompanyPageHeader';

type LinkItem = { href: string; labelKey: string };

const ACCESS_LINKS: LinkItem[] = [
  { href: '/admin/users', labelKey: 'companyBackoffice.linkUsers' },
  { href: '/admin/memberships', labelKey: 'companyBackoffice.linkMemberships' },
  { href: '/admin/boutiques', labelKey: 'companyBackoffice.linkBoutiques' },
  { href: '/admin/regions', labelKey: 'companyBackoffice.linkRegions' },
];

const DATA_LINKS: LinkItem[] = [
  { href: '/targets', labelKey: 'companyBackoffice.linkTargets' },
  { href: '/admin/import', labelKey: 'companyBackoffice.linkImports' },
  { href: '/admin/import/issues', labelKey: 'companyBackoffice.linkImportIssues' },
];

const SYSTEM_LINKS: LinkItem[] = [
  { href: '/admin/administration', labelKey: 'companyBackoffice.linkAdmin' },
  { href: '/admin/system', labelKey: 'companyBackoffice.linkSystem' },
  { href: '/admin/system-audit', labelKey: 'companyBackoffice.linkAudit' },
  { href: '/admin/system/version', labelKey: 'nav.admin.administrationVersion' },
];

function LinkList({ items }: { items: LinkItem[] }) {
  const { t } = useT();
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {items.map((l) => (
        <li key={l.href} className="min-w-0">
          <Link
            href={l.href}
            className="break-words text-accent underline-offset-2 hover:underline"
          >
            {t(l.labelKey)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CompanyGovernanceClient({
  boutiqueCount,
  employeeCount,
  appVersion,
  buildId,
}: {
  boutiqueCount: number;
  employeeCount: number;
  appVersion: string;
  buildId: string | null;
}) {
  const { t } = useT();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-3 py-6 md:px-6">
      <CompanyPageHeader
        title={t('companyBackoffice.governanceTitle')}
        description={t('companyBackoffice.governanceIntro')}
        month=""
        onMonthChange={() => {}}
        hideMonthControls
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <OpsCard title={t('companyBackoffice.metadata')}>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{t('companyBackoffice.activeBoutiques')}</dt>
              <dd className="tabular-nums text-lg font-semibold text-foreground">{boutiqueCount}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{t('companyBackoffice.activeEmployees')}</dt>
              <dd className="tabular-nums text-lg font-semibold text-foreground">{employeeCount}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{t('companyBackoffice.appVersion')}</dt>
              <dd className="font-mono text-sm font-medium text-foreground">{appVersion}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t('companyBackoffice.buildId')}</dt>
              <dd className="max-w-[12rem] break-all text-end font-mono text-xs font-medium text-foreground">
                {buildId || t('companyBackoffice.buildIdDev')}
              </dd>
            </div>
          </dl>
        </OpsCard>

        <OpsCard title={t('companyBackoffice.sectionAccess')}>
          <LinkList items={ACCESS_LINKS} />
        </OpsCard>

        <OpsCard title={t('companyBackoffice.sectionData')}>
          <LinkList items={DATA_LINKS} />
        </OpsCard>
      </section>

      <OpsCard title={t('companyBackoffice.sectionSystem')}>
        <LinkList items={SYSTEM_LINKS} />
      </OpsCard>
    </div>
  );
}
