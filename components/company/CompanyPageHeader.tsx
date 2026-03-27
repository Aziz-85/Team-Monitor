'use client';

import { CompanyMonthControls } from '@/components/company/CompanyMonthControls';

export function CompanyPageHeader({
  title,
  description,
  month,
  onMonthChange,
  contextLine,
  hideMonthControls = false,
}: {
  title: string;
  description: string;
  month: string;
  onMonthChange: (m: string) => void;
  /** Optional subline (e.g. month context for alerts). */
  contextLine?: string;
  /** e.g. Governance hub — no MTD month selector. */
  hideMonthControls?: boolean;
}) {
  return (
    <header className="flex w-full min-w-0 max-w-full flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-full flex-1 text-start">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        {contextLine ? (
          <p className="mt-2 text-xs font-medium text-muted-foreground tabular-nums">{contextLine}</p>
        ) : null}
      </div>
      {!hideMonthControls ? (
        <div className="shrink-0 self-stretch pt-0 sm:pt-1 sm:ms-auto">
          <CompanyMonthControls month={month} onMonthChange={onMonthChange} />
        </div>
      ) : null}
    </header>
  );
}
