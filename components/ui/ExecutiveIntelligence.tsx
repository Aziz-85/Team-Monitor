import type { ReactNode } from 'react';

export type ExecutiveTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<ExecutiveTone, { ring: string; icon: string; title: string }> = {
  default: {
    ring: 'border-border',
    icon: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
    title: 'text-foreground',
  },
  success: {
    ring: 'border-emerald-200/80 dark:border-emerald-800/60',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    title: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    ring: 'border-amber-200/80 dark:border-amber-800/60',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    title: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    ring: 'border-rose-200/80 dark:border-rose-800/60',
    icon: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    title: 'text-rose-700 dark:text-rose-300',
  },
  info: {
    ring: 'border-sky-200/80 dark:border-sky-800/60',
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    title: 'text-sky-700 dark:text-sky-300',
  },
};

function toneClass(tone: ExecutiveTone | undefined) {
  return toneClasses[tone ?? 'default'];
}

function withCardBase(className = '') {
  return `rounded-xl border bg-surface shadow-sm ${className}`.trim();
}

export type PageContainerProps = {
  children: ReactNode;
  className?: string;
  /** Compact reduces paddings/gaps for dense pages. */
  compact?: boolean;
};

export function PageContainer({ children, className = '', compact = false }: PageContainerProps) {
  return (
    <div
      className={`mx-auto min-w-0 w-full max-w-7xl ${compact ? 'space-y-4 p-4 md:p-5' : 'space-y-6 p-4 md:p-6'} ${className}`}
    >
      {children}
    </div>
  );
}

export type SectionBlockProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionBlock({
  title,
  subtitle,
  rightSlot,
  children,
  className = '',
  contentClassName = '',
}: SectionBlockProps) {
  return (
    <section className={withCardBase(`p-4 md:p-5 ${className}`)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground md:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="flex shrink-0 items-center gap-2">{rightSlot}</div> : null}
      </div>
      <div className={`mt-4 min-w-0 ${contentClassName}`}>{children}</div>
    </section>
  );
}

export type KPIGridProps = {
  children: ReactNode;
  /** Number of columns at xl screens (2..6). */
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
};

export function KPIGrid({ children, cols = 4, className = '' }: KPIGridProps) {
  const xlCols =
    cols === 2
      ? 'xl:grid-cols-2'
      : cols === 3
        ? 'xl:grid-cols-3'
        : cols === 5
          ? 'xl:grid-cols-5'
          : cols === 6
            ? 'xl:grid-cols-6'
            : 'xl:grid-cols-4';
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${xlCols} ${className}`}>{children}</div>;
}

export type InsightGridProps = {
  children: ReactNode;
  className?: string;
};

export function InsightGrid({ children, className = '' }: InsightGridProps) {
  return <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 ${className}`}>{children}</div>;
}

export type KPIStatCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  tone?: ExecutiveTone;
  trendLabel?: string;
  supportLabel?: string;
  className?: string;
};

export function KPIStatCard({
  title,
  value,
  subtitle,
  icon,
  tone = 'default',
  trendLabel,
  supportLabel,
  className = '',
}: KPIStatCardProps) {
  const c = toneClass(tone);
  return (
    <article className={withCardBase(`p-4 ${c.ring} ${className}`)}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${c.title}`}>{title}</p>
        {icon ? (
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.icon}`}>{icon}</span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground md:text-3xl">{value}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      {trendLabel || supportLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {trendLabel ? <span className={c.title}>{trendLabel}</span> : null}
          {supportLabel ? <span className="text-muted">{supportLabel}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export type InsightCardProps = {
  title: string;
  description: string;
  tone?: ExecutiveTone;
  icon?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function InsightCard({
  title,
  description,
  tone = 'default',
  icon,
  footer,
  className = '',
}: InsightCardProps) {
  const c = toneClass(tone);
  return (
    <article className={withCardBase(`p-4 ${c.ring} ${className}`)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.icon}`}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold ${c.title}`}>{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          {footer ? <div className="mt-2 text-xs text-muted">{footer}</div> : null}
        </div>
      </div>
    </article>
  );
}

export type RecommendationCardProps = {
  title: string;
  message: string;
  tone?: ExecutiveTone;
  icon?: ReactNode;
  actionSlot?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function RecommendationCard({
  title,
  message,
  tone = 'info',
  icon,
  actionSlot,
  footer,
  className = '',
}: RecommendationCardProps) {
  const c = toneClass(tone);
  return (
    <article className={withCardBase(`p-4 ${c.ring} ${className}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.icon}`}>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className={`text-sm font-semibold ${c.title}`}>{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
          </div>
        </div>
        {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
      </div>
      {footer ? <div className="mt-3 border-t border-border pt-3 text-xs text-muted">{footer}</div> : null}
    </article>
  );
}

export type EmptyStateBlockProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export function EmptyStateBlock({ title, description, icon, className = '' }: EmptyStateBlockProps) {
  return (
    <div className={withCardBase(`p-8 text-center ${className}`)}>
      {icon ? <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-subtle text-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-lg text-sm text-muted">{description}</p> : null}
    </div>
  );
}

