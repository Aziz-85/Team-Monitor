import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/tasks', key: 'tasks.list' },
  { href: '/tasks/monitor', key: 'tasks.monitor' },
  { href: '/tasks/setup', key: 'tasks.setup' },
  { href: '/boutique/tasks', key: 'tasks.boutique' },
];

export default async function NavOperationsTasksPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('operations.tasks.title')}
      subtitle={t('operations.tasks.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.operations.title'), href: '/nav/operations' },
        { label: t('operations.tasks.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
