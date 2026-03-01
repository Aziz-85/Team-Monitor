/**
 * GET /api/area/boutiques — List boutiques for Area Manager dropdowns. AREA_MANAGER / SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';

export async function GET(
  request: NextRequest
) {
  void request; // GET signature; assertAreaManagerOrSuperAdmin uses session
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json(boutiques);
}
