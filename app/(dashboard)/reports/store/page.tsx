import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getOperationalScope } from '@/lib/scope/operationalScope';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export const dynamic = 'force-dynamic';

/** Redirects to the store report for the current operational boutique. */
export default async function StoreReportIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) redirect('/');

  const scope = await getOperationalScope();
  const boutiqueId = scope?.boutiqueId ?? user.boutiqueId;
  if (!boutiqueId) redirect('/');

  redirect(`/reports/store/${boutiqueId}`);
}
