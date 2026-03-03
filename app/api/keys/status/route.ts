import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { getCurrentKeyHolders } from '@/lib/keys/keyService';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const READ_ROLES: Role[] = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * GET /api/keys/status
 * Returns current key holders for the scoped boutique.
 * EMPLOYEE+ can read.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(READ_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getScheduleScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }

  const holders = await getCurrentKeyHolders(scope.boutiqueId);
  const key1Name = holders.key1HolderEmployeeId
    ? await getEmployeeName(holders.key1HolderEmployeeId)
    : null;
  const key2Name = holders.key2HolderEmployeeId
    ? await getEmployeeName(holders.key2HolderEmployeeId)
    : null;

  return NextResponse.json({
    boutiqueId: scope.boutiqueId,
    key1HolderEmployeeId: holders.key1HolderEmployeeId,
    key2HolderEmployeeId: holders.key2HolderEmployeeId,
    key1HolderName: key1Name,
    key2HolderName: key2Name,
    key1LastHandoverAt: holders.key1LastHandoverAt?.toISOString() ?? null,
    key2LastHandoverAt: holders.key2LastHandoverAt?.toISOString() ?? null,
  });
}

async function getEmployeeName(empId: string): Promise<string | null> {
  const emp = await prisma.employee.findUnique({
    where: { empId },
    select: { name: true },
  });
  return emp?.name ?? null;
}
