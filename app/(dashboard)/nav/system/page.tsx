import { DrilldownLayout } from '@/components/nav/DrilldownCards';
import { getServerTranslations } from '@/lib/i18n/serverTranslate';
import { getDrilldownUser, hrefSetFromGroups } from '@/lib/nav/drilldown';

const CARDS = [
  { href: '/nav/system/admin', gate: '/admin/administration', titleKey: 'system.admin.title', hintKey: 'system.admin.hint' },
  { href: '/nav/system/imports', gate: '/admin/import', titleKey: 'system.imports.title', hintKey: 'system.imports.hint' },
  { href: '/admin/integrations/planner', gate: '/admin/integrations/planner', titleKey: 'system.integrations.title', hintKey: 'system.integrations.hint' },
  { href: '/about', gate: '/about', titleKey: 'system.about.title', hintKey: 'system.about.hint' },
];

export default async function NavSystemPage() {
  const t = await getServerTranslations('nav.drilldown');
  const { groups } = await getDrilldownUser();
  const allowed = hrefSetFromGroups(groups);
  const cards = CARDS.filter((c) => allowed.has(c.gate));

  return (
    <DrilldownLayout
      title={t('sections.system.title')}
      subtitle={t('sections.system.subtitle')}
      cards={cards.map((c) => ({ href: c.href, title: t(c.titleKey), hint: t(c.hintKey) }))}
    />
  );
}
