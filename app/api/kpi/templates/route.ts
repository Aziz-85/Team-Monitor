/**
 * GET /api/kpi/templates — List KPI templates. ADMIN only.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const templates = await prisma.kpiTemplate.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, version: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ templates });
}
