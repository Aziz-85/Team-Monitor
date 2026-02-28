/**
 * GET /api/kpi/employee?empId=...&periodKey=... — Get KPI snapshot for employee.
 * ADMIN: any. MANAGER: within scope. EMPLOYEE: own only (optional).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import { logKpiAudit } from '@/lib/kpi/audit';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;

  const empId = request.nextUrl.searchParams.get('empId')?.trim();
  const periodKey = request.nextUrl.searchParams.get('periodKey')?.trim();
  if (!empId || !periodKey) {
    return NextResponse.json({ error: 'empId and periodKey required' }, { status: 400 });
  }

  const resolved = await resolveScopeForUser(user.id, role, null);
  const isOwn = (await prisma.user.findUnique({ where: { id: user.id }, select: { empId: true } }))?.empId === empId;

  if (role === 'EMPLOYEE' || role === 'ASSISTANT_MANAGER') {
    if (!isOwn) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
    if (role === 'MANAGER' && !resolved.boutiqueIds.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const snapshot = await prisma.employeeKpiSnapshot.findFirst({
    where: {
      empId,
      periodKey,
      ...(role === 'MANAGER' ? { boutiqueId: { in: resolved.boutiqueIds } } : {}),
    },
    include: { upload: { select: { fileName: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (snapshot) {
    await logKpiAudit({
      actorId: user.id,
      action: 'KPI_SNAPSHOT_VIEWED',
      boutiqueId: snapshot.boutiqueId,
      empId: snapshot.empId,
      periodKey: snapshot.periodKey,
      metadata: { snapshotId: snapshot.id },
    });
  }

  return NextResponse.json({
    snapshot: snapshot
      ? {
          id: snapshot.id,
          empId: snapshot.empId,
          periodKey: snapshot.periodKey,
          overallOutOf5: snapshot.overallOutOf5,
          salesKpiOutOf5: snapshot.salesKpiOutOf5,
          skillsOutOf5: snapshot.skillsOutOf5,
          companyOutOf5: snapshot.companyOutOf5,
          sectionsJson: snapshot.sectionsJson,
          rawJson: snapshot.rawJson,
          createdAt: snapshot.createdAt,
          fileName: snapshot.upload?.fileName,
        }
      : null,
  });
}
