'use client';

import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { useT } from '@/lib/i18n/useT';

const ADMINISTRATION_CARDS: { href: string; titleKey: string; descKey: string }[] = [
  { href: '/admin/administration/users', titleKey: 'admin.administration.usersAndRoles', descKey: 'admin.administration.usersAndRolesDesc' },
  { href: '/admin/administration/access', titleKey: 'admin.administration.permissionsAccess', descKey: 'admin.administration.permissionsAccessDesc' },
  { href: '/admin/administration/calendar', titleKey: 'admin.administration.calendar', descKey: 'admin.administration.calendarDesc' },
  { href: '/admin/administration/audit', titleKey: 'admin.administration.auditLogs', descKey: 'admin.administration.auditLogsDesc' },
  { href: '/admin/administration/settings', titleKey: 'admin.administration.systemSettings', descKey: 'admin.administration.systemSettingsDesc' },
  { href: '/admin/administration/version', titleKey: 'admin.administration.versionBuild', descKey: 'admin.administration.versionBuildDesc' },
  { href: '/admin/sales-integrity', titleKey: 'admin.administration.salesIntegrity', descKey: 'admin.administration.salesIntegrityDesc' },
];

export function AdminAdministrationClient() {
  const { t } = useT();
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold text-foreground">{t('admin.administration.dashboardTitle')}</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMINISTRATION_CARDS.map((card) => (
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
