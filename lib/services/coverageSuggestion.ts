import { prisma } from '@/lib/db';
import { rosterForDate } from './roster';
import { validateCoverage } from './coverageValidation';

/**
 * Coverage Move Suggestions – ADVISORY ONLY.
 * Sat–Thu: suggest AM → PM when AM > PM (PM ≥ 2 after move).
 * Friday (PM-only): suggest AM → PM when AM > 0.
 */

export interface CoverageSuggestionImpact {
  amBefore: number;
  pmBefore: number;
  amAfter: number;
  pmAfter: number;
}

export interface CoverageSuggestion {
  date: string;
  fromShift: 'MORNING' | 'EVENING';
  toShift: 'EVENING' | 'MORNING';
  empId: string;
  employeeName: string;
  reason: string;
  impact: CoverageSuggestionImpact;
}

export interface CoverageSuggestionResult {
  suggestion: CoverageSuggestion | null;
  explanation?: string;
}

function toDateKey(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const FRIDAY_DAY_OF_WEEK = 5;

export type CoverageSuggestionOptions = { boutiqueIds?: string[] };

/**
 * Get a single suggested move: Friday (PM-only) AM→PM when AM>0; Sat–Thu AM>PM → AM→PM (PM≥2 after move).
 * Ranking: prefer employees with fewer overrides in the same month (fairness).
 */
export async function getCoverageSuggestion(
  date: Date,
  options: CoverageSuggestionOptions = {}
): Promise<CoverageSuggestionResult> {
  const dateKey = toDateKey(date);
  const d = new Date(dateKey + 'T12:00:00Z');
  const dayOfWeek = d.getUTCDay();
  const isFriday = dayOfWeek === FRIDAY_DAY_OF_WEEK;

  const validations = await validateCoverage(date, options);
  const roster = await rosterForDate(date, options);
  const amCount = roster.amEmployees.length;
  const pmCount = roster.pmEmployees.length;

  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  /** Friday PM-only: suggest moving one AM → PM when AM > 0. */
  const amOnFriday = validations.find((v) => v.type === 'AM_ON_FRIDAY');
  if (isFriday && amOnFriday && amCount >= 1) {
    const overrideCounts = await prisma.shiftOverride.groupBy({
      by: ['empId'],
      where: { isActive: true, date: { gte: monthStart, lte: monthEnd } },
      _count: { id: true },
    });
    const countByEmpId = new Map(overrideCounts.map((o) => [o.empId, o._count.id]));
    const candidates = [...roster.amEmployees].sort((a, b) => (countByEmpId.get(a.empId) ?? 0) - (countByEmpId.get(b.empId) ?? 0));
    const chosen = candidates[0];
    if (!chosen) return { suggestion: null, explanation: undefined };
    return {
      suggestion: {
        date: dateKey,
        fromShift: 'MORNING',
        toShift: 'EVENING',
        empId: chosen.empId,
        employeeName: chosen.name,
        reason: `Friday is PM-only; AM (${amCount}) must be 0. Moving ${chosen.name} from AM to PM.`,
        impact: { amBefore: amCount, pmBefore: pmCount, amAfter: amCount - 1, pmAfter: pmCount + 1 },
      },
      explanation: undefined,
    };
  }

  /** Sat–Thu: AM > PM → suggest move AM → PM; require after move PM ≥ 2 and PM ≥ AM. */
  const amGtPm = validations.find((v) => v.type === 'AM_GT_PM');
  if (!amGtPm || amCount <= pmCount) return { suggestion: null, explanation: undefined };

  const effectiveMinPm = 2;
  const afterAm = amCount - 1;
  const afterPm = pmCount + 1;
  if (afterPm < effectiveMinPm) {
    return { suggestion: null, explanation: 'Cannot suggest move because PM would fall below minimum (2)' };
  }
  if (afterAm > afterPm) {
    return { suggestion: null, explanation: 'Cannot suggest move because AM would still exceed PM after move' };
  }

  if (roster.amEmployees.length === 0) return { suggestion: null, explanation: 'No AM employees to move' };

  const overrideCounts = await prisma.shiftOverride.groupBy({
    by: ['empId'],
    where: { isActive: true, date: { gte: monthStart, lte: monthEnd } },
    _count: { id: true },
  });
  const countByEmpId = new Map(overrideCounts.map((o) => [o.empId, o._count.id]));
  const candidates = [...roster.amEmployees].sort((a, b) => (countByEmpId.get(a.empId) ?? 0) - (countByEmpId.get(b.empId) ?? 0));
  const chosen = candidates[0];
  if (!chosen) return { suggestion: null, explanation: 'All AM employees are unavailable or blocked' };

  return {
    suggestion: {
      date: dateKey,
      fromShift: 'MORNING',
      toShift: 'EVENING',
      empId: chosen.empId,
      employeeName: chosen.name,
      reason: `AM (${amCount}) > PM (${pmCount}). Moving 1 from AM to PM → AM=${afterAm}, PM=${afterPm} (PM ≥ 2).`,
      impact: { amBefore: amCount, pmBefore: pmCount, amAfter: afterAm, pmAfter: afterPm },
    },
    explanation: undefined,
  };
}
