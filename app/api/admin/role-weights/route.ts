import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRoleWeightsFromDb } from '@/lib/sales-target-weights';
import type { Role } from '@prisma/client';
import type { SalesTargetRole } from '@/lib/sales-target-weights';

const VALID_ROLES: SalesTargetRole[] = [
  'MANAGER',
  'ASSISTANT_MANAGER',
  'HIGH_JEWELLERY_EXPERT',
  'SENIOR_SALES_ADVISOR',
  'SALES_ADVISOR',
];

/** GET: Admin only. Return current role weights from DB. */
export async function GET() {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const weights = await getRoleWeightsFromDb(prisma);
  return NextResponse.json({ weights });
}

/** PUT: Admin only. Update role weights in DB. */
export async function PUT(request: NextRequest) {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: { weights?: Record<string, number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const weights = body.weights;
  if (!weights || typeof weights !== 'object') {
    return NextResponse.json({ error: 'weights object required' }, { status: 400 });
  }
  for (const role of VALID_ROLES) {
    const v = weights[role];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    await prisma.salesTargetRoleWeight.upsert({
      where: { role },
      create: { role, weight: v },
      update: { weight: v },
    });
  }
  const updated = await getRoleWeightsFromDb(prisma);
  return NextResponse.json({ ok: true, weights: updated });
}
