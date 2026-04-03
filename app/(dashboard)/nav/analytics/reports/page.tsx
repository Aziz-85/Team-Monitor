import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/executive', key: 'reports.executive' },
  { href: '/executive/monthly', key: 'reports.monthly' },
  { href: '/executive/insights', key: 'reports.insights' },
  { href: '/executive/compare', key: 'reports.compare' },
  { href: '/executive/employees', key: 'reports.employees' },
  { href: '/reports/weekly', key: 'reports.weekly' },
  { href: '/targets', key: 'reports.targetsAdmin' },
  { href: '/targets/boutiques', key: 'reports.targetsBoutiques' },
  { href: '/targets/employees', key: 'reports.targetsEmployees' },
  { href: '/targets/import', key: 'reports.targetsImport' },
  { href: '/company', key: 'reports.company' },
];

export default async function NavAnalyticsReportsPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('analytics.reports.title')}
      subtitle={t('analytics.reports.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.analytics.title'), href: '/nav/analytics' },
        { label: t('analytics.reports.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
