/**
 * GET/POST /api/me/admin-filter — get/set admin filter (ADMIN only).
 * Stored in UserPreference.adminFilterJson; separate from scopeJson.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { AdminFilterJson, AdminFilterKind } from '@/lib/scope/adminFilter';
import type { Role } from '@prisma/client';

const VALID_KINDS: AdminFilterKind[] = ['ALL', 'BOUTIQUE', 'REGION', 'GROUP'];

function parseBody(body: unknown): AdminFilterJson | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const kind = o.kind as string | undefined;
  if (!kind || !VALID_KINDS.includes(kind as AdminFilterKind)) return null;
  const result: AdminFilterJson = { kind: kind as AdminFilterKind };
  if (typeof o.boutiqueId === 'string' && o.boutiqueId) result.boutiqueId = o.boutiqueId;
  if (typeof o.regionId === 'string' && o.regionId) result.regionId = o.regionId;
  if (typeof o.groupId === 'string' && o.groupId) result.groupId = o.groupId;
  return result;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((user.role as Role) !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { adminFilterJson: true },
  });
  let filter: AdminFilterJson | null = null;
  if (pref?.adminFilterJson) {
    try {
      filter = JSON.parse(pref.adminFilterJson) as AdminFilterJson;
      if (!filter?.kind || !VALID_KINDS.includes(filter.kind)) filter = null;
    } catch {
      filter = null;
    }
  }
  return NextResponse.json({ filter: filter ?? { kind: 'ALL' } });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((user.role as Role) !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const filter = parseBody(body);
  if (!filter) {
    return NextResponse.json(
      { error: 'Invalid body: kind required (ALL | BOUTIQUE | REGION | GROUP)' },
      { status: 400 }
    );
  }

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: { adminFilterJson: JSON.stringify(filter) },
    create: {
      userId: user.id,
      adminFilterJson: JSON.stringify(filter),
    },
  });
  return NextResponse.json({ filter });
}
