import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getCoverageSuggestion } from '@/lib/services/coverageSuggestion';
import type { Role } from '@prisma/client';

/**
 * GET /api/suggestions/coverage/week?weekStart=YYYY-MM-DD
 * Returns suggestions keyed by date for the 7 days starting weekStart.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }
  const start = new Date(weekStart + 'T00:00:00Z');
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Invalid weekStart' }, { status: 400 });
  }

  const byDate: Record<string, { suggestion: Awaited<ReturnType<typeof getCoverageSuggestion>>['suggestion']; explanation?: string }> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    const result = await getCoverageSuggestion(d);
    byDate[dateKey] = { suggestion: result.suggestion, explanation: result.explanation };
  }

  return NextResponse.json({ weekStart, byDate });
}
