import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups, type DrilldownCard } from '@/lib/nav/drilldown';

type TeamCard = DrilldownCard & { gate: string };

const TEAM_CARDS: TeamCard[] = [
  { href: '/nav/team/schedule', gate: '/schedule/view', titleKey: 'team.schedule.title', hintKey: 'team.schedule.hint' },
  { href: '/nav/team/employees', gate: '/admin/employees', titleKey: 'team.employees.title', hintKey: 'team.employees.hint' },
  { href: '/nav/team/leaves', gate: '/leaves', titleKey: 'team.leaves.title', hintKey: 'team.leaves.hint' },
  { href: '/approvals', gate: '/approvals', titleKey: 'team.approvals.title', hintKey: 'team.approvals.hint' },
  { href: '/compliance', gate: '/compliance', titleKey: 'team.compliance.title', hintKey: 'team.compliance.hint' },
];

export default async function NavTeamPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = TEAM_CARDS.filter((c) => allowed.has(c.gate));

  return (
    <DrilldownLayout
      title={t('sections.team.title')}
      subtitle={t('sections.team.subtitle')}
      cards={cards.map((c) => ({ href: c.href, title: t(c.titleKey), hint: t(c.hintKey) }))}
    />
  );
}
