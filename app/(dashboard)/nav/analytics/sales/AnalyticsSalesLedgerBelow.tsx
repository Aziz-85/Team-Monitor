'use client';

import { SectionBlock } from '@/components/ui/ExecutiveIntelligence';
import { DailySalesLedgerPanel } from '@/components/admin/import/DailySalesLedgerPanel';
import { useT } from '@/lib/i18n/useT';

/** Embedded Daily Sales Ledger on the Sales analytics hub (below route cards). */
export function AnalyticsSalesLedgerBelow({
  canAdminUnlockLedger = false,
  canManageDailyTotal = false,
}: {
  canAdminUnlockLedger?: boolean;
  canManageDailyTotal?: boolean;
}) {
  const { t } = useT();
  return (
    <SectionBlock
      title={t('nav.drilldown.analytics.sales.ledgerSectionTitle')}
      subtitle={t('nav.drilldown.analytics.sales.ledgerSectionHint')}
    >
      <DailySalesLedgerPanel
        canAdminUnlockLedger={canAdminUnlockLedger}
        canManageDailyTotal={canManageDailyTotal}
      />
    </SectionBlock>
  );
}
