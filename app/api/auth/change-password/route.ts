import { NextRequest, NextResponse } from 'next/server';
import { requireSession, invalidateAllSessionsForUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current and new password required' },
        { status: 400 }
      );
    }

    const u = await prisma.user.findUnique({ where: { id: user.id } });
    if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ok = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        mustChangePassword: false,
      },
    });

    await invalidateAllSessionsForUser(user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { name?: string };
    if (err.name === 'AuthError') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
