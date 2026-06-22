import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import {
  assertStoreReportAccess,
  buildStoreReport,
  StoreReportError,
} from '@/lib/reports/storeReportService';
import { getCurrentMonthKeyRiyadh, normalizeMonthKey } from '@/lib/time';
import { StoreReportView } from '@/components/reports/StoreReportView';
import type { Role } from '@prisma/client';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ boutiqueId: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function StoreReportPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) redirect('/');

  const { boutiqueId } = await params;
  const sp = await searchParams;
  const monthKey =
    typeof sp.month === 'string' && sp.month.trim()
      ? normalizeMonthKey(sp.month.trim())
      : getCurrentMonthKeyRiyadh();

  try {
    await assertStoreReportAccess(user.role as Role, boutiqueId);
    const data = await buildStoreReport(boutiqueId, monthKey);
    return (
      <div className="min-h-screen bg-slate-50/80 p-4 pb-nav md:p-8 print:bg-white print:p-0">
        <StoreReportView data={data} />
      </div>
    );
  } catch (e) {
    if (e instanceof StoreReportError) {
      if (e.code === 'NOT_FOUND') notFound();
      redirect('/');
    }
    throw e;
  }
}
