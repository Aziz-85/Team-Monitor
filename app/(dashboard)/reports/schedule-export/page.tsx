import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import {
  getScheduleExportBoutiqueOptions,
  SCHEDULE_EXPORT_ROLES,
} from '@/lib/services/scheduleExportScope';
import { canExportScheduleAudit } from '@/lib/services/scheduleFullExport';
import { ScheduleExportClient } from './ScheduleExportClient';
import type { Role } from '@prisma/client';

export default async function ScheduleExportPage({
  searchParams,
}: {
  searchParams: { weekStart?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!SCHEDULE_EXPORT_ROLES.includes(user.role as Role)) redirect('/');

  const scheduleScope = await getScheduleScope();
  const boutiques = await getScheduleExportBoutiqueOptions(user);
  const canSelectAll = boutiques.length > 1;
  const defaultBoutiqueId = scheduleScope?.boutiqueId ?? user.boutiqueId ?? boutiques[0]?.id ?? '';

  const initialWeekStart =
    typeof searchParams.weekStart === 'string' ? searchParams.weekStart.trim() : undefined;

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <Suspense
        fallback={<p className="mx-auto max-w-3xl p-4 text-sm text-muted">Loading…</p>}
      >
        <ScheduleExportClient
          initialWeekStart={initialWeekStart}
          defaultBoutiqueId={defaultBoutiqueId}
          boutiques={boutiques}
          canSelectAll={canSelectAll}
          canExportAudit={canExportScheduleAudit(user.role as Role)}
        />
      </Suspense>
    </div>
  );
}
