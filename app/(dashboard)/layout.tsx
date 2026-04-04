import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

/** Entire authenticated shell uses fresh session/scope data (sales, schedule, tasks, admin). */
export const dynamic = 'force-dynamic';
import { Sidebar } from '@/components/nav/Sidebar';
import { MobileTopBar } from '@/components/nav/MobileTopBar';
import { DesktopTopBar } from '@/components/nav/DesktopTopBar';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardBreadcrumbBar } from '@/components/nav/DashboardBreadcrumbBar';
import { IdleDetector } from '@/components/IdleDetector';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { getOperationalScope } from '@/lib/scope/operationalScope';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  if (!user.boutiqueId && (user.role as string) !== 'SUPER_ADMIN' && (user.role as string) !== 'DEMO_VIEWER') {
    redirect('/login?error=no_boutique');
  }

  const scope = await getOperationalScope();
  const boutiqueId = scope?.boutiqueId ?? user.boutiqueId ?? '';
  const access = boutiqueId
    ? await getEffectiveAccess(
        { id: user.id, role: user.role as import('@prisma/client').Role, canEditSchedule: user.canEditSchedule },
        boutiqueId
      )
    : null;
  const navRole = (user.role as string) === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (user.role as string) === 'DEMO_VIEWER' ? 'DEMO_VIEWER' : (access?.effectiveRole ?? user.role);
  const canEditSchedule = (user.role as string) === 'SUPER_ADMIN' ? true : (user.role as string) === 'DEMO_VIEWER' ? false : (access?.effectiveFlags.canEditSchedule ?? false);
  const canApproveWeek = (user.role as string) === 'SUPER_ADMIN' ? true : (user.role as string) === 'DEMO_VIEWER' ? false : (access?.effectiveFlags.canApproveWeek ?? false);
  const isDemoMode = (user.role as string) === 'DEMO_VIEWER';

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden bg-background">
      <IdleDetector />
      <Sidebar
        role={navRole}
        name={user.employee?.name ?? undefined}
        position={user.employee?.position ?? undefined}
        canEditSchedule={canEditSchedule}
        canApproveWeek={canApproveWeek}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        {isDemoMode && (
          <div className="shrink-0 bg-amber-100 border-b border-amber-300 px-3 py-2 text-center text-sm font-semibold text-amber-900">
            DEMO MODE — READ ONLY
          </div>
        )}
        <MobileTopBar
          role={navRole}
          name={user.employee?.name ?? undefined}
          position={user.employee?.position ?? undefined}
          canEditSchedule={canEditSchedule}
          canApproveWeek={canApproveWeek}
        />
        <DesktopTopBar
          name={user.employee?.name ?? undefined}
          role={navRole as import('@prisma/client').Role}
          position={user.employee?.position ?? undefined}
        />
        <main className="flex-1 min-w-0">
          <DashboardBreadcrumbBar />
          <RouteGuard role={navRole}>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
