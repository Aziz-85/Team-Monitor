/**
 * POST /api/admin/users/reset-password
 * ADMIN/SUPER_ADMIN only. Set a new password for a user (by empId).
 * Body: { empId: string, newPassword: string }
 * Updates passwordHash, sets mustChangePassword: true, invalidates their sessions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateAllSessionsForUser } from '@/lib/auth';
import * as bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';

const MIN_PASSWORD_LENGTH = 8;

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
  const empId = String(body.empId ?? '').trim();
  const newPassword = String(body.newPassword ?? '');

  if (!empId) {
    return NextResponse.json({ error: 'empId is required' }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { empId },
    select: { id: true, empId: true, role: true, employee: { select: { name: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if ((targetUser.role as string) === 'SUPER_ADMIN' && (actor.role as string) !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot reset SUPER_ADMIN password' }, { status: 403 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      passwordHash: hash,
      mustChangePassword: true,
    },
  });

  await invalidateAllSessionsForUser(targetUser.id);

  return NextResponse.json({
    ok: true,
    empId: targetUser.empId,
    message: 'Password reset. User must change password on next login.',
  });
}
