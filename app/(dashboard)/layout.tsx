import { redirect } from 'next/navigation';
import { getAuthenticatedSession } from '@/lib/platformOwner/session';

/** Entire authenticated shell uses fresh session/scope data (sales, schedule, tasks, admin). */
export const dynamic = 'force-dynamic';
import { Sidebar } from '@/components/nav/Sidebar';
import { MobileTopBar } from '@/components/nav/MobileTopBar';
import { MobileBottomNav } from '@/components/nav/MobileBottomNav';
import { DesktopTopBar } from '@/components/nav/DesktopTopBar';
import { PlatformModeBanner } from '@/components/nav/PlatformModeBanner';
import { RouteGuard } from '@/components/RouteGuard';
import { DashboardBreadcrumbBar } from '@/components/nav/DashboardBreadcrumbBar';
import { IdleDetector } from '@/components/IdleDetector';
import { VersionFooter } from '@/components/auth/VersionFooter';
import { getEffectiveAccessForBoutique } from '@/lib/rbac/effectiveAccess';
import { getOperationalScope } from '@/lib/scope/operationalScope';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthenticatedSession();
  if (!auth) {
    redirect('/login');
  }
  const user = auth.user;
  if (!user.boutiqueId && (user.role as string) !== 'SUPER_ADMIN' && (user.role as string) !== 'DEMO_VIEWER') {
    redirect('/login?error=no_boutique');
  }

  const scope = await getOperationalScope();
  const boutiqueId = auth.access.globalScope
    ? (scope?.boutiqueId ?? '')
    : (auth.access.scopeBoutiqueId ?? scope?.boutiqueId ?? user.boutiqueId ?? '');
  const access = boutiqueId && !auth.access.globalScope
    ? await getEffectiveAccessForBoutique(boutiqueId, {
        id: user.id,
        role: auth.access.effectiveRole as import('@prisma/client').Role,
        canEditSchedule: user.canEditSchedule,
      })
    : null;
  const navRole = auth.access.effectiveRole as import('@prisma/client').Role;
  const canEditSchedule =
    auth.access.globalScope
      ? true
      : (user.role as string) === 'DEMO_VIEWER'
        ? false
        : (access?.effectiveFlags.canEditSchedule ?? user.canEditSchedule);
  const canApproveWeek =
    auth.access.globalScope
      ? true
      : (user.role as string) === 'DEMO_VIEWER'
        ? false
        : (access?.effectiveFlags.canApproveWeek ?? false);
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
        <PlatformModeBanner />
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
        <MobileBottomNav
          role={navRole}
          canEditSchedule={canEditSchedule}
          canApproveWeek={canApproveWeek}
        />
        <VersionFooter />
      </div>
    </div>
  );
}
