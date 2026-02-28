import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMobileUserFromRequest, MOBILE_PERMISSIONS_BY_ROLE } from '@/lib/mobileAuth';

export async function GET(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: mobileUser.userId },
      select: {
        id: true,
        empId: true,
        role: true,
        boutiqueId: true,
        disabled: true,
        boutique: { select: { id: true, name: true } },
      },
    });

    if (!user || user.disabled) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = MOBILE_PERMISSIONS_BY_ROLE[user.role] ?? [];

    return NextResponse.json({
      user: { id: user.id, empId: user.empId, role: user.role },
      boutique: user.boutique ? { id: user.boutique.id, name: user.boutique.name } : null,
      permissions,
    });
  } catch (err) {
    console.error('[mobile/me]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
