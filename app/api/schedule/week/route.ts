import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { rosterForDate } from '@/lib/services/roster';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { getCoverageSuggestion } from '@/lib/services/coverageSuggestion';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  const scopeOptions = { boutiqueIds: scheduleScope.boutiqueIds };

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const start = new Date(weekStart + 'T00:00:00Z');
  const days: Array<{
    date: string;
    roster: Awaited<ReturnType<typeof rosterForDate>>;
    coverageValidation: Awaited<ReturnType<typeof validateCoverage>>;
    coverageSuggestion: Awaited<ReturnType<typeof getCoverageSuggestion>>['suggestion'];
    coverageSuggestionExplanation?: string;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const [roster, coverageValidation, suggestionResult] = await Promise.all([
      rosterForDate(d, scopeOptions),
      validateCoverage(d, scopeOptions),
      getCoverageSuggestion(d, scopeOptions),
    ]);
    days.push({
      date: d.toISOString().slice(0, 10),
      roster,
      coverageValidation,
      coverageSuggestion: suggestionResult.suggestion,
      coverageSuggestionExplanation: suggestionResult.explanation,
    });
  }

  return NextResponse.json({ weekStart, days });
}
