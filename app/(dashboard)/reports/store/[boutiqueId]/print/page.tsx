import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import {
  assertStoreReportAccess,
  buildStoreReport,
  StoreReportError,
} from '@/lib/reports/storeReportService';
import { getCurrentMonthKeyRiyadh, normalizeMonthKey } from '@/lib/time';
import { StoreReportView } from '@/components/reports/StoreReportView';
import { StoreReportPrintStyles } from '@/components/reports/StoreReportPrintStyles';
import type { Role } from '@prisma/client';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ boutiqueId: string }>;
  searchParams: Promise<{ month?: string; auto?: string }>;
};

export default async function StoreReportPrintPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) redirect('/');

  const { boutiqueId } = await params;
  const sp = await searchParams;
  const monthKey =
    typeof sp.month === 'string' && sp.month.trim()
      ? normalizeMonthKey(sp.month.trim())
      : getCurrentMonthKeyRiyadh();
  const autoPrint = sp.auto === '1' || sp.auto === 'true';

  try {
    await assertStoreReportAccess(user.role as Role, boutiqueId);
    const data = await buildStoreReport(boutiqueId, monthKey);
    return (
      <>
        <StoreReportPrintStyles autoPrint={autoPrint} />
        <div className="min-h-screen bg-white p-6 md:p-10 print:p-0">
          <StoreReportView data={data} printMode />
        </div>
      </>
    );
  } catch (e) {
    if (e instanceof StoreReportError) {
      if (e.code === 'NOT_FOUND') notFound();
      redirect('/');
    }
    throw e;
  }
}
