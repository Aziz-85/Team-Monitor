import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const ROUTES = [
  { href: '/admin/administration', key: 'admin.administration' },
  { href: '/admin/audit/login', key: 'admin.loginAudit' },
  { href: '/admin/system', key: 'admin.system' },
  { href: '/admin/system/version', key: 'admin.version' },
  { href: '/admin/system-audit', key: 'admin.systemAudit' },
  { href: '/admin/users', key: 'admin.users' },
  { href: '/admin/memberships', key: 'admin.memberships' },
  { href: '/admin/boutiques', key: 'admin.boutiques' },
  { href: '/admin/regions', key: 'admin.regions' },
  { href: '/admin/boutique-groups', key: 'admin.groups' },
  { href: '/admin/coverage-rules', key: 'admin.coverageRules' },
  { href: '/admin/kpi-templates', key: 'admin.kpiTemplates' },
  { href: '/admin/reset-password', key: 'admin.resetPassword' },
  { href: '/admin/reset-emp-id', key: 'admin.resetEmpId' },
  { href: '/admin/integrations/planner', key: 'admin.planner' },
  { href: '/admin/integrations/planner/completions', key: 'admin.plannerCompletions' },
  { href: '/about', key: 'admin.about' },
];

export default async function NavSystemAdminPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = ROUTES.filter((c) => allowed.has(c.href));
  return (
    <DrilldownLayout
      title={t('system.admin.title')}
      subtitle={t('system.admin.hint')}
      breadcrumbs={[
        { label: t('breadcrumbs.home'), href: '/' },
        { label: t('sections.system.title'), href: '/nav/system' },
        { label: t('system.admin.title') },
      ]}
      cards={cards.map((c) => ({ href: c.href, title: t(`routes.${c.key}.title`), hint: t(`routes.${c.key}.hint`) }))}
    />
  );
}
