import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { SESSION_IDLE_MINUTES } from '@/lib/sessionConfig';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const boutiqueLabel =
    user.boutique != null
      ? `${user.boutique.name} (${user.boutique.code})`
      : user.boutiqueId
        ? String(user.boutiqueId)
        : undefined;

  const boutiqueId = user.boutiqueId ?? '';
  const access = boutiqueId
    ? await getEffectiveAccess(
        { id: user.id, role: user.role as import('@prisma/client').Role, canEditSchedule: user.canEditSchedule },
        boutiqueId
      )
    : null;

  return NextResponse.json({
    user: {
      id: user.id,
      empId: user.empId,
      role: user.role,
      effectiveRole: access?.effectiveRole ?? user.role,
      boutiqueId: user.boutiqueId ?? undefined,
      boutiqueLabel,
      mustChangePassword: user.mustChangePassword,
      name: user.employee?.name,
      language: user.employee?.language ?? 'en',
      canEditSchedule: access?.effectiveFlags.canEditSchedule ?? false,
      canApproveWeek: access?.effectiveFlags.canApproveWeek ?? false,
    },
    idleMinutes: SESSION_IDLE_MINUTES,
    idleWarningMinutes: Math.max(1, SESSION_IDLE_MINUTES - 2),
  });
}
