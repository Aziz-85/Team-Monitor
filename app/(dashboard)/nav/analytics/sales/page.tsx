import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';
import { AnalyticsSalesLedgerBelow } from './AnalyticsSalesLedgerBelow';

const ROUTES = [
  { href: '/sales/my', key: 'sales.my' },
  { href: '/sales/summary', key: 'sales.summary' },
  { href: '/sales/daily', key: 'sales.daily' },
  { href: '/sales/returns', key: 'sales.returns' },
  { href: '/sales/leadership-impact', key: 'sales.leadership' },
  { href: '/me/target', key: 'sales.myTarget' },
  { href: '/kpi/upload', key: 'sales.kpi' },
  { href: '/admin/import/sales', key: 'sales.importAdmin' },
  { href: '/sales/import', key: 'sales.import' },
  { href: '/sales/import-matrix', key: 'sales.importMatrix' },
  { href: '/sales/import-issues', key: 'sales.importIssues' },
  { href: '/sales/monthly-matrix', key: 'sales.monthlyMatrix' },
  { href: '/admin/sales-edit-requests', key: 'sales.editRequests' },
];

export default async function NavAnalyticsSalesPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('analytics.sales.title')}
      subtitle={t('analytics.sales.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.analytics.title'), href: '/nav/analytics' },
        { label: t('analytics.sales.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
      belowCards={allowed.has('/sales/daily') ? <AnalyticsSalesLedgerBelow /> : undefined}
    />
  );
}
