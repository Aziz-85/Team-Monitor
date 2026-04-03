'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageContainer, SectionBlock } from '@/components/ui/ExecutiveIntelligence';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type NavRouteCardItem = {
  href: string;
  title: string;
  hint: string;
};

export function DrilldownLayout({
  title,
  subtitle,
  breadcrumbs,
  cards,
  belowCards,
}: {
  title: string;
  subtitle: string;
  breadcrumbs: BreadcrumbItem[];
  cards: NavRouteCardItem[];
  /** Optional region below the route grid (e.g. embedded tool on hub pages). */
  belowCards?: ReactNode;
}) {
  const router = useRouter();
  return (
    <PageContainer className="mx-auto max-w-6xl space-y-8">
      <SectionBlock
        title={title}
        subtitle={subtitle}
        rightSlot={
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
          >
            Back
          </button>
        }
      >
        <nav aria-label="Breadcrumb" className="text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-2">
            {breadcrumbs.map((crumb, idx) => (
              <li key={`${crumb.label}-${idx}`} className="flex items-center gap-2">
                {crumb.href ? <Link href={crumb.href} className="hover:text-foreground">{crumb.label}</Link> : <span className="text-foreground/80">{crumb.label}</span>}
                {idx < breadcrumbs.length - 1 ? <span>/</span> : null}
              </li>
            ))}
          </ol>
        </nav>
      </SectionBlock>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-subtle"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50 group-hover:bg-accent" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground/90">{card.title}</h3>
                <p className="mt-1 text-sm text-muted">{card.hint}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
      {belowCards != null ? <div className="mt-10 min-w-0 space-y-6">{belowCards}</div> : null}
    </PageContainer>
  );
}
