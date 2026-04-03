'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImportSalesPanel } from '@/components/admin/import/ImportSalesPanel';
import { MonthlyImportMatrixPanel } from '@/components/admin/import/MonthlyImportMatrixPanel';
import { ImportIssuesPanel } from '@/components/admin/import/ImportIssuesPanel';
import { DailySalesLedgerPanel } from '@/components/admin/import/DailySalesLedgerPanel';
import { MonthlyMatrixPanel } from '@/components/admin/import/MonthlyMatrixPanel';
import { PageContainer, SectionBlock } from '@/components/ui/ExecutiveIntelligence';
import { useT } from '@/lib/i18n/useT';

const SECTIONS = [
  { id: 'import', labelKey: 'admin.import.salesHubTabImport' as const },
  { id: 'matrix', labelKey: 'admin.import.salesHubTabMatrix' as const },
  { id: 'issues', labelKey: 'admin.import.salesHubTabIssues' as const },
  { id: 'ledger', labelKey: 'admin.import.salesHubTabLedger' as const },
  { id: 'monthly', labelKey: 'admin.import.salesHubTabMonthly' as const },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const VALID_SECTIONS: SectionId[] = ['import', 'matrix', 'issues', 'ledger', 'monthly'];

function parseSection(value: string | null): SectionId {
  if (value && VALID_SECTIONS.includes(value as SectionId)) return value as SectionId;
  return 'import';
}

export function SalesImportTabsClient({ canResolve }: { canResolve: boolean }) {
  const { t } = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = parseSection(searchParams.get('section'));

  const setSection = (next: SectionId) => {
    router.replace(`/admin/import/sales?section=${next}`, { scroll: false });
  };

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-8 md:space-y-10">
      <SectionBlock
        title={t('admin.import.salesHubTitle')}
        subtitle={t('admin.import.salesHubSubtitle')}
        rightSlot={
          <Link
            href="/nav/system/imports"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface-subtle"
          >
            {t('common.back')}
          </Link>
        }
      >
        <p className="mb-4 text-xs text-muted">{t('admin.import.salesHubBreadcrumb')}</p>

        {/* Horizontal tabs — same pill style as FilterBar quick periods (no sidebar). */}
        <div className="mb-8 flex flex-wrap items-center gap-1.5 border-b border-border pb-4">
          {SECTIONS.map(({ id, labelKey }) => {
            const selected = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-accent bg-surface-subtle text-foreground'
                    : 'border-border bg-surface text-muted hover:bg-surface-subtle hover:text-foreground'
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 min-w-0">
          {section === 'import' && <ImportSalesPanel />}
          {section === 'matrix' && <MonthlyImportMatrixPanel />}
          {section === 'issues' && <ImportIssuesPanel canResolve={canResolve} />}
          {section === 'ledger' && <DailySalesLedgerPanel />}
          {section === 'monthly' && <MonthlyMatrixPanel />}
        </div>
      </SectionBlock>
    </PageContainer>
  );
}
