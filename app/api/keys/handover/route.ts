import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import {
  ensureBoutiqueKeys,
  getCurrentKeyHolders,
} from '@/lib/keys/keyService';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const HANDOVER_ROLES: Role[] = ['ASSISTANT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * POST /api/keys/handover
 * Body: { keyNumber: 1|2, toEmployeeId: string, handoverAt?: ISO string, note?: string }
 * Manual handover: manager/admin transfers a key.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(HANDOVER_ROLES);
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

  const user = await getSessionUser();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { keyNumber?: number; toEmployeeId?: string; handoverAt?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const keyNumber = body.keyNumber === 1 || body.keyNumber === 2 ? body.keyNumber : null;
  const toEmployeeId = typeof body.toEmployeeId === 'string' ? body.toEmployeeId.trim() : '';
  if (!keyNumber || !toEmployeeId) {
    return NextResponse.json(
      { error: 'keyNumber (1 or 2) and toEmployeeId are required' },
      { status: 400 }
    );
  }

  const emp = await prisma.employee.findUnique({
    where: { empId: toEmployeeId },
    select: { empId: true, boutiqueId: true },
  });
  if (!emp || emp.boutiqueId !== scope.boutiqueId) {
    return NextResponse.json({ error: 'Employee not found or not in this boutique' }, { status: 400 });
  }

  const { key1Id, key2Id } = await ensureBoutiqueKeys(scope.boutiqueId);
  const keyId = keyNumber === 1 ? key1Id : key2Id;
  const holders = await getCurrentKeyHolders(scope.boutiqueId);
  const fromEmployeeId = keyNumber === 1 ? holders.key1HolderEmployeeId : holders.key2HolderEmployeeId;

  const handoverAt = body.handoverAt
    ? new Date(body.handoverAt)
    : new Date();
  if (Number.isNaN(handoverAt.getTime())) {
    return NextResponse.json({ error: 'Invalid handoverAt' }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.trim() || null : null;

  const handover = await prisma.keyHandover.create({
    data: {
      boutiqueId: scope.boutiqueId,
      keyId,
      fromEmployeeId,
      toEmployeeId: emp.empId,
      handoverAt,
      note,
      createdByUserId: user.id,
    },
  });

  return NextResponse.json({
    id: handover.id,
    keyNumber,
    fromEmployeeId,
    toEmployeeId: handover.toEmployeeId,
    handoverAt: handover.handoverAt.toISOString(),
  });
}
