import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/schedule/view', key: 'schedule.view' },
  { href: '/schedule/edit', key: 'schedule.edit' },
  { href: '/schedule/editor', key: 'schedule.dayEditor' },
  { href: '/schedule/audit', key: 'schedule.audit' },
  { href: '/schedule/audit-edits', key: 'schedule.auditEdits' },
  { href: '/approvals?module=SCHEDULE', key: 'schedule.approvals' },
];

export default async function NavTeamSchedulePage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('team.schedule.title')}
      subtitle={t('team.schedule.hint')}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
