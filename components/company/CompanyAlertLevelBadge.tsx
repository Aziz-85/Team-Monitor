'use client';

import type { CompanyAlertLevel } from '@/lib/company/types';
import { useT } from '@/lib/i18n/useT';

const levelClass: Record<CompanyAlertLevel, string> = {
  high: 'bg-destructive/15 text-destructive border-destructive/30',
  medium: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800',
  low: 'bg-muted text-muted-foreground border-border',
};

export function CompanyAlertLevelBadge({ level }: { level: CompanyAlertLevel }) {
  const { t } = useT();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${levelClass[level]}`}
    >
      {t(`companyBackoffice.alertLevel.${level}`)}
    </span>
  );
}
