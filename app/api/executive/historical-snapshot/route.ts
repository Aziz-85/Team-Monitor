/**
 * GET /api/executive/historical-snapshot?boutiqueId=...&month=YYYY-MM
 * ADMIN: can read any boutique. Non-admin: only their active (operational) boutique.
 * Returns snapshot JSON; 404 if file missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { resolveOperationalBoutiqueId } from '@/lib/boutique/resolveOperationalBoutique';
import { readSnapshot } from '@/lib/historical-snapshots/storage';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const boutiqueIdParam = searchParams.get('boutiqueId')?.trim() ?? '';
  const month = searchParams.get('month')?.trim() ?? '';

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const role = user.role as Role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  let boutiqueId: string;

  if (isAdmin) {
    if (!boutiqueIdParam) {
      return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
    }
    boutiqueId = boutiqueIdParam;
  } else {
    const resolved = await resolveOperationalBoutiqueId(user.id, role, null);
    boutiqueId = resolved.boutiqueId;
    if (!boutiqueId) {
      return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
    }
    if (boutiqueIdParam && boutiqueIdParam !== boutiqueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const snapshot = await readSnapshot(boutiqueId, month);
  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
