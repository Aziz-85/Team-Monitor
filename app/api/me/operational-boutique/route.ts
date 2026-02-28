/**
 * GET /api/me/operational-boutique — current session-bound boutique only (no switching)
 * POST — 403: boutique switching is not allowed.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const boutiqueId = user.boutiqueId ?? '';
  const label = user.boutique
    ? `${user.boutique.name} (${user.boutique.code})`
    : boutiqueId || '—';

  return NextResponse.json({
    boutiqueId,
    label,
    boutiques: [],
    canSelect: false,
  });
}

export async function POST() {
  return NextResponse.json(
    { error: 'Boutique switching is not allowed. Log in with the correct account for another boutique.' },
    { status: 403 }
  );
}
