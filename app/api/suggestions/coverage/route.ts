import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { getCoverageSuggestion } from '@/lib/services/coverageSuggestion';
import type { Role } from '@prisma/client';

/**
 * GET /api/suggestions/coverage?date=YYYY-MM-DD
 * Returns validations and optional suggestion for that date.
 * Manager/Admin get full suggestion; Employee may get general warnings only (same for now).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dateParam = request.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
  }
  const date = new Date(dateParam + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const [validations, suggestionResult] = await Promise.all([
    validateCoverage(date),
    getCoverageSuggestion(date),
  ]);

  return NextResponse.json({
    date: dateParam,
    validations,
    suggestion: suggestionResult.suggestion,
    explanation: suggestionResult.explanation,
  });
}
