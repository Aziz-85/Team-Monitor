import { NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/platformOwner/session';
import { getEffectiveAccessForBoutique } from '@/lib/rbac/effectiveAccess';
import { SESSION_IDLE_MINUTES } from '@/lib/sessionConfig';

export async function GET() {
  const auth = await getAuthenticatedSession();
  if (!auth) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const user = auth.user;
  const boutiqueLabel =
    user.boutique != null
      ? `${user.boutique.name} (${user.boutique.code})`
      : user.boutiqueId
        ? String(user.boutiqueId)
        : undefined;

  const boutiqueId = auth.access.globalScope ? '' : (auth.access.scopeBoutiqueId ?? user.boutiqueId ?? '');
  const access = boutiqueId
    ? await getEffectiveAccessForBoutique(boutiqueId, {
        id: user.id,
        role: auth.access.effectiveRole as import('@prisma/client').Role,
        canEditSchedule: user.canEditSchedule,
      })
    : null;

  return NextResponse.json({
    user: {
      id: user.id,
      empId: user.empId,
      role: user.role,
      effectiveRole: auth.access.effectiveRole,
      isPlatformOwner: auth.access.isPlatformOwner,
      activeMode: auth.access.activeMode,
      globalScope: auth.access.globalScope,
      boutiqueId: user.boutiqueId ?? undefined,
      boutiqueLabel,
      mustChangePassword: user.mustChangePassword,
      name: user.employee?.name,
      language: user.employee?.language ?? 'en',
      canEditSchedule: auth.access.globalScope ? true : (access?.effectiveFlags.canEditSchedule ?? user.canEditSchedule),
      canApproveWeek: auth.access.globalScope ? true : (access?.effectiveFlags.canApproveWeek ?? false),
    },
    idleMinutes: SESSION_IDLE_MINUTES,
    idleWarningMinutes: Math.max(1, SESSION_IDLE_MINUTES - 2),
  });
}
