/**
 * Smart Suggestions Engine – ADVISORY ONLY. Never auto-applies.
 * Policy: Sat–Thu min 2 AM + min 2 PM, PM > AM; Friday PM-only.
 */

import type { ScheduleGridResult } from './scheduleGrid';
import { evaluateCoverage, effectiveMinAm, effectiveMinPm, isFridayDay } from '@/lib/schedule/coveragePolicy';

export type SuggestionType = 'MOVE' | 'SWAP' | 'REMOVE_COVER' | 'ASSIGN';

export interface ScheduleSuggestion {
  id: string;
  type: SuggestionType;
  date: string;
  dayIndex: number;
  affected: Array<{ empId: string; name: string; fromShift: string; toShift: string }>;
  before: { am: number; pm: number; rashidAm: number; rashidPm: number };
  after: { am: number; pm: number; rashidAm: number; rashidPm: number };
  reason: string;
  highlightCells: string[];
}

function cellKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

/**
 * Build ranked suggestions for the week aligned with coverage policy.
 */
export function buildScheduleSuggestions(grid: ScheduleGridResult): ScheduleSuggestion[] {
  const out: ScheduleSuggestion[] = [];
  const { days, rows, counts } = grid;

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    const date = day.date;
    const c = counts[dayIndex] ?? { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    const am = c.amCount;
    const pm = c.pmCount;
    const rashidAm = c.rashidAmCount ?? 0;
    const rashidPm = c.rashidPmCount ?? 0;
    const issues = evaluateCoverage({ am, pm }, day.dayOfWeek, day.minAm ?? 0, day.minPm ?? 0);
    if (issues.length === 0) continue;

    const minAm = effectiveMinAm(day.dayOfWeek, day.minAm ?? 0);
    const minPm = effectiveMinPm(day.dayOfWeek, day.minPm ?? 0);

    // Friday / PM not above AM / PM below min: move AM → PM
    if (
      issues.some((i) => i.type === 'AM_ON_FRIDAY' || i.type === 'PM_NOT_ABOVE_AM' || i.type === 'PM_BELOW_MIN') &&
      am >= 1
    ) {
      const amCandidates = rows.filter((r) => {
        const cell = r.cells[dayIndex];
        return cell?.availability === 'WORK' && (cell?.effectiveShift === 'MORNING' || cell?.effectiveShift === 'SPLIT');
      });
      const chosen = amCandidates[0];
      if (chosen) {
        const afterAm = am - 1;
        const afterPm = pm + 1;
        if (isFridayDay(day.dayOfWeek) || (afterAm >= minAm && afterPm > afterAm && afterPm >= minPm)) {
          out.push({
            id: `move-${date}-${chosen.empId}`,
            type: 'MOVE',
            date,
            dayIndex,
            affected: [{ empId: chosen.empId, name: chosen.name, fromShift: 'MORNING', toShift: 'EVENING' }],
            before: { am, pm, rashidAm, rashidPm },
            after: { am: afterAm, pm: afterPm, rashidAm, rashidPm },
            reason: `Move ${chosen.name} AM→PM (${issues[0]?.message ?? 'coverage fix'})`,
            highlightCells: [cellKey(chosen.empId, date)],
          });
          continue;
        }
      }
    }

    // AM below min: assign NONE → AM
    if (issues.some((i) => i.type === 'AM_BELOW_MIN')) {
      const noneCandidates = rows.filter((r) => {
        const cell = r.cells[dayIndex];
        return cell?.availability === 'WORK' && cell?.effectiveShift === 'NONE';
      });
      const chosen = noneCandidates[0];
      if (chosen && am + 1 < pm) {
        out.push({
          id: `assign-am-${date}-${chosen.empId}`,
          type: 'ASSIGN',
          date,
          dayIndex,
          affected: [{ empId: chosen.empId, name: chosen.name, fromShift: 'NONE', toShift: 'MORNING' }],
          before: { am, pm, rashidAm, rashidPm },
          after: { am: am + 1, pm, rashidAm, rashidPm },
          reason: `Assign ${chosen.name} to AM (minimum ${minAm} required)`,
          highlightCells: [cellKey(chosen.empId, date)],
        });
        continue;
      }
    }

    // PM below min: Rashid PM → boutique PM
    if (issues.some((i) => i.type === 'PM_BELOW_MIN') && rashidPm >= 1) {
      const rashidPmRows = rows.filter((r) => {
        const cell = r.cells[dayIndex];
        return cell?.availability === 'WORK' && cell?.effectiveShift === 'COVER_RASHID_PM';
      });
      const chosen = rashidPmRows[0];
      if (chosen) {
        out.push({
          id: `remove-cover-pm-${date}-${chosen.empId}`,
          type: 'REMOVE_COVER',
          date,
          dayIndex,
          affected: [{ empId: chosen.empId, name: chosen.name, fromShift: 'COVER_RASHID_PM', toShift: 'EVENING' }],
          before: { am, pm, rashidAm, rashidPm },
          after: { am, pm: pm + 1, rashidAm, rashidPm: rashidPm - 1 },
          reason: `PM (${pm}) below minimum (${minPm}). Cancel Rashid PM for ${chosen.name} → Boutique PM.`,
          highlightCells: [cellKey(chosen.empId, date)],
        });
      }
    }
  }

  return out;
}
