import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/leaves/requests', key: 'leaves.myRequests' },
  { href: '/leaves', key: 'leaves.manage' },
  { href: '/boutique/leaves', key: 'leaves.boutique' },
  { href: '/admin/control-panel/delegation', key: 'leaves.delegation' },
  { href: '/compliance', key: 'leaves.compliance' },
];

export default async function NavTeamLeavesPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('team.leaves.title')}
      subtitle={t('team.leaves.hint')}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
