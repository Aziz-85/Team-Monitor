import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import {
  assertStoreReportAccess,
  buildStoreReport,
  StoreReportError,
} from '@/lib/reports/storeReportService';
import { parseStoreReportPeriodFromSearchParams } from '@/lib/reports/storeReportPeriod';
import { StoreReportView } from '@/components/reports/StoreReportView';
import type { Role } from '@prisma/client';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ boutiqueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StoreReportPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) redirect('/');

  const { boutiqueId } = await params;
  const sp = await searchParams;
  const periodQuery = parseStoreReportPeriodFromSearchParams(sp);

  try {
    await assertStoreReportAccess(user.role as Role, boutiqueId);
    const data = await buildStoreReport(boutiqueId, periodQuery);
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
