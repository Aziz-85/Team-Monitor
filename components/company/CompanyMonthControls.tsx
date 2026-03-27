'use client';

import { useT } from '@/lib/i18n/useT';

export function CompanyMonthControls({
  month,
  onMonthChange,
  className = '',
}: {
  month: string;
  onMonthChange: (month: string) => void;
  className?: string;
}) {
  const { t, isRtl } = useT();
  return (
    <label
      className={`flex min-w-0 max-w-full flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 ${className}`}
    >
      <span className="shrink-0 text-sm font-medium text-muted-foreground">{t('companyBackoffice.month')}</span>
      <input
        type="month"
        dir="ltr"
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
        style={{ textAlign: isRtl ? 'right' : 'left' }}
      />
    </label>
  );
}
