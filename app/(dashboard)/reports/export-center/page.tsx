import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import {
  getScheduleExportBoutiqueOptions,
  SCHEDULE_EXPORT_ROLES,
} from '@/lib/services/scheduleExportScope';
import { canExportScheduleAudit } from '@/lib/services/scheduleFullExport';
import { ExportCenterClient } from './ExportCenterClient';
import type { Role } from '@prisma/client';

const SALES_EXPORT_ROLES: Role[] = [
  'EMPLOYEE',
  'ASSISTANT_MANAGER',
  'MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
  'AREA_MANAGER',
];

export default async function ExportCenterPage({
  searchParams,
}: {
  searchParams: { weekStart?: string; category?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const role = user.role as Role;
  const canSchedule = SCHEDULE_EXPORT_ROLES.includes(role);
  const canSales = SALES_EXPORT_ROLES.includes(role);
  const canTasks = SCHEDULE_EXPORT_ROLES.includes(role);

  if (!canSchedule && !canSales && !canTasks) redirect('/');

  const scheduleScope = await getScheduleScope();
  const boutiques = await getScheduleExportBoutiqueOptions(user);
  const canSelectAll = boutiques.length > 1;
  const defaultBoutiqueId = scheduleScope?.boutiqueId ?? user.boutiqueId ?? boutiques[0]?.id ?? '';

  const initialWeekStart =
    typeof searchParams.weekStart === 'string' ? searchParams.weekStart.trim() : undefined;
  const initialCategory =
    searchParams.category === 'sales' || searchParams.category === 'tasks' || searchParams.category === 'schedule'
      ? searchParams.category
      : undefined;

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <Suspense
        fallback={<p className="mx-auto max-w-4xl p-4 text-sm text-muted">Loading…</p>}
      >
        <ExportCenterClient
          initialCategory={initialCategory}
          initialWeekStart={initialWeekStart}
          defaultBoutiqueId={defaultBoutiqueId}
          boutiques={boutiques}
          canSelectAll={canSelectAll}
          canExportAudit={canExportScheduleAudit(role)}
          canExportSales={canSales}
          canExportTasks={canTasks}
        />
      </Suspense>
    </div>
  );
}
