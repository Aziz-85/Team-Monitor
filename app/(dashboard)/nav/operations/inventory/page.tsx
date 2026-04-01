import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/inventory/daily', key: 'inventory.daily' },
  { href: '/inventory/daily/history', key: 'inventory.history' },
  { href: '/inventory/zones', key: 'inventory.zones' },
  { href: '/inventory/follow-up', key: 'inventory.followup' },
];

export default async function NavOperationsInventoryPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('operations.inventory.title')}
      subtitle={t('operations.inventory.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.operations.title'), href: '/nav/operations' },
        { label: t('operations.inventory.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
