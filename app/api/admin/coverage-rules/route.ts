import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import type { Role } from '@prisma/client';

export async function GET() {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rules = await prisma.coverageRule.findMany({ orderBy: { dayOfWeek: 'asc' } });
  return NextResponse.json(rules);
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.minAM !== undefined) update.minAM = Number(body.minAM);
  if (body.minPM !== undefined) update.minPM = Number(body.minPM);
  if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);

  const rule = await prisma.coverageRule.update({
    where: { id },
    data: update,
  });
  clearCoverageValidationCache();
  return NextResponse.json(rule);
}
