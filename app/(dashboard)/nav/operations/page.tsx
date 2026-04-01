import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const CARDS = [
  { href: '/nav/operations/tasks', gate: '/tasks', titleKey: 'operations.tasks.title', hintKey: 'operations.tasks.hint' },
  { href: '/nav/operations/inventory', gate: '/inventory/daily', titleKey: 'operations.inventory.title', hintKey: 'operations.inventory.hint' },
  { href: '/boutique/tasks', gate: '/boutique/tasks', titleKey: 'operations.boutiqueTasks.title', hintKey: 'operations.boutiqueTasks.hint' },
  { href: '/sync/planner', gate: '/sync/planner', titleKey: 'operations.sync.title', hintKey: 'operations.sync.hint' },
];

export default async function NavOperationsPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = CARDS.filter((c) => allowed.has(c.gate));

  return (
    <DrilldownLayout
      title={t('sections.operations.title')}
      subtitle={t('sections.operations.subtitle')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.operations.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(c.titleKey), hint: t(c.hintKey) }))}
    />
  );
}
