import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const CARDS = [
  { href: '/nav/analytics/sales', gate: '/sales/summary', titleKey: 'analytics.sales.title', hintKey: 'analytics.sales.hint' },
  { href: '/nav/analytics/reports', gate: '/reports/weekly', titleKey: 'analytics.reports.title', hintKey: 'analytics.reports.hint' },
  { href: '/targets', gate: '/targets', titleKey: 'analytics.targets.title', hintKey: 'analytics.targets.hint' },
  { href: '/company', gate: '/company', titleKey: 'analytics.company.title', hintKey: 'analytics.company.hint' },
];

export default async function NavAnalyticsPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = CARDS.filter((c) => allowed.has(c.gate));

  return (
    <DrilldownLayout
      title={t('sections.analytics.title')}
      subtitle={t('sections.analytics.subtitle')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.analytics.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(c.titleKey), hint: t(c.hintKey) }))}
    />
  );
}
