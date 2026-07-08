import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import type { Role } from '@prisma/client';
import { backfillBoutiqueConfiguration } from '@/lib/boutique-config/backfill';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as Role[];

/** Backfill configuration for all active boutiques, or a single boutique when boutiqueId is provided. */
export async function POST(request: NextRequest) {
  try {
    await requireRole(ADMIN_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = typeof body.boutiqueId === 'string' && body.boutiqueId ? body.boutiqueId : undefined;
  const summary = await backfillBoutiqueConfiguration(boutiqueId);
  return NextResponse.json({ ok: true, summary });
}
