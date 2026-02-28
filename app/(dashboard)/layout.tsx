import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { Sidebar } from '@/components/nav/Sidebar';
import { MobileTopBar } from '@/components/nav/MobileTopBar';
import { RouteGuard } from '@/components/RouteGuard';
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
  if (!user.boutiqueId && (user.role as string) !== 'SUPER_ADMIN') {
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
  const navRole = (user.role as string) === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (access?.effectiveRole ?? user.role);
  const canEditSchedule = (user.role as string) === 'SUPER_ADMIN' ? true : (access?.effectiveFlags.canEditSchedule ?? false);
  const canApproveWeek = (user.role as string) === 'SUPER_ADMIN' ? true : (access?.effectiveFlags.canApproveWeek ?? false);

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden" style={{ background: 'var(--app-bg)' }}>
      <IdleDetector />
      <Sidebar
        role={navRole}
        name={user.employee?.name ?? undefined}
        position={user.employee?.position ?? undefined}
        canEditSchedule={canEditSchedule}
        canApproveWeek={canApproveWeek}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        <MobileTopBar
          role={navRole}
          name={user.employee?.name ?? undefined}
          position={user.employee?.position ?? undefined}
          canEditSchedule={canEditSchedule}
          canApproveWeek={canApproveWeek}
        />
        <main className="flex-1 min-w-0">
          <RouteGuard role={navRole}>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
