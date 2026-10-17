/**
 * GET /api/area/boutiques — List boutiques for Area Manager dropdowns. AREA_MANAGER / SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { getUserAllowedBoutiqueIds } from '@/lib/scope/resolveScope';

export async function GET(
  request: NextRequest
) {
  void request; // GET signature; assertAreaManagerOrSuperAdmin uses session
  try {
    const user = await assertAreaManagerOrSuperAdmin();
    const allowedIds = user.role === 'SUPER_ADMIN' ? null : await getUserAllowedBoutiqueIds(user.id);
    const boutiques = await prisma.boutique.findMany({
      where: { isActive: true, ...(allowedIds ? { id: { in: allowedIds } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    return NextResponse.json(boutiques);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
