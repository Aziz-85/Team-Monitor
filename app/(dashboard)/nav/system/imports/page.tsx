import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/admin/import', key: 'imports.center' },
  { href: '/admin/import-center', key: 'imports.centerLegacy' },
  { href: '/admin/historical-import', key: 'imports.historicalLegacy' },
  { href: '/admin/import/monthly-snapshot', key: 'imports.monthlySnapshot' },
  { href: '/admin/import/historical', key: 'imports.historical' },
  { href: '/admin/import/issues', key: 'imports.issues' },
  { href: '/admin/import/sales', key: 'imports.salesAdmin' },
  { href: '/sales/import', key: 'imports.sales' },
  { href: '/sales/import-matrix', key: 'imports.matrix' },
  { href: '/sales/import-issues', key: 'imports.salesIssues' },
  { href: '/sales/monthly-matrix', key: 'imports.monthlyMatrix' },
];

export default async function NavSystemImportsPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('system.imports.title')}
      subtitle={t('system.imports.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.system.title'), href: '/nav/system' },
        { label: t('system.imports.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
