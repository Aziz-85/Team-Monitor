/**
 * POST /api/admin/users/fix-empid
 * ADMIN/SUPER_ADMIN only. Corrects wrong empId for an employee (e.g. Muslim Algumiah 1100 → 2011).
 * Updates Employee.empId (User.empId is updated via FK ON UPDATE CASCADE) and writes AuthAuditLog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    actor = await requireRole(['ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const fullName = String(body.fullName ?? '').trim();
  const oldEmpId = String(body.oldEmpId ?? '').trim();
  const newEmpIdRaw = String(body.newEmpId ?? '').trim();
  const newEmpId = newEmpIdRaw;

  if (!/^\d{3,}$/.test(newEmpId)) {
    return NextResponse.json(
      { error: 'newEmpId must be digits only and length >= 3' },
      { status: 400 }
    );
  }
  if (newEmpId === oldEmpId) {
    return NextResponse.json({ error: 'newEmpId must differ from oldEmpId' }, { status: 400 });
  }

  const existingNewUser = await prisma.user.findUnique({
    where: { empId: newEmpId },
    select: { id: true },
  });
  if (existingNewUser) {
    return NextResponse.json(
      { error: `User with empId ${newEmpId} already exists` },
      { status: 400 }
    );
  }

  const existingNewEmployee = await prisma.employee.findUnique({
    where: { empId: newEmpId },
    select: { empId: true },
  });
  if (existingNewEmployee) {
    return NextResponse.json(
      { error: `Employee with empId ${newEmpId} already exists` },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      empId: oldEmpId,
      ...(fullName
        ? { employee: { name: { equals: fullName, mode: 'insensitive' } } }
        : {}),
    },
    select: {
      id: true,
      empId: true,
      employee: { select: { name: true } },
    },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: fullName ? `No user found with empId ${oldEmpId} and name "${fullName}"` : `No user found with empId ${oldEmpId}` },
      { status: 404 }
    );
  }
  if (targetUser.empId !== oldEmpId) {
    return NextResponse.json({ error: 'Target user empId mismatch' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const employeeExists = await (tx as typeof prisma).employee.findUnique({
        where: { empId: oldEmpId },
        select: { empId: true },
      });
      if (employeeExists) {
        await (tx as typeof prisma).$executeRawUnsafe(
          `UPDATE "Employee" SET "empId" = $1 WHERE "empId" = $2`,
          newEmpId,
          oldEmpId
        );
        // User.empId is updated automatically via FK ON UPDATE CASCADE
      } else {
        await (tx as typeof prisma).user.updateMany({
          where: { empId: oldEmpId },
          data: { empId: newEmpId },
        });
      }
      await (tx as typeof prisma).authAuditLog.create({
        data: {
          event: 'EMPID_CHANGED',
          userId: actor!.id,
          metadata: {
            targetUserId: targetUser.id,
            name: fullName || targetUser.employee?.name || '—',
            oldEmpId,
            newEmpId,
            actorUserId: actor!.id,
          } as object,
        },
      });
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2002') {
      return NextResponse.json(
        { error: `empId ${newEmpId} already in use (race)` },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    targetUserId: targetUser.id,
    oldEmpId,
    newEmpId,
  });
}
