/**
 * Smart Suggestions Engine – ADVISORY ONLY. Never auto-applies.
 * Policy: PM ≥ AM, PM ≥ 2 (Sat–Thu); Friday PM-only (AM = 0).
 * Never suggests violating Friday rule, Leave/OFF/Absent.
 */

import type { ScheduleGridResult } from './scheduleGrid';
import { FRIDAY_DAY_OF_WEEK } from './shift';

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

const FRIDAY = FRIDAY_DAY_OF_WEEK;

function cellKey(empId: string, date: string): string {
  return `${empId}|${date}`;
}

/**
 * Build ranked suggestions for the week. Policy: PM ≥ AM, PM ≥ 2; Friday PM-only.
 */
export function buildScheduleSuggestions(grid: ScheduleGridResult): ScheduleSuggestion[] {
  const out: ScheduleSuggestion[] = [];
  const { days, rows, counts } = grid;

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    const date = day.date;
    const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
    const isFriday = dayOfWeek === FRIDAY;
    const c = counts[dayIndex] ?? { amCount: 0, pmCount: 0, rashidAmCount: 0, rashidPmCount: 0 };
    const am = c.amCount;
    const pm = c.pmCount;
    const rashidAm = c.rashidAmCount ?? 0;
    const rashidPm = c.rashidPmCount ?? 0;
    const effectiveMinPm = isFriday ? (day.minPm ?? 0) : Math.max(day.minPm ?? 0, 2);

    // 1) Sat–Thu: AM > PM → MOVE one AM → PM if after move PM ≥ AM and PM ≥ 2
    if (!isFriday && am > pm && am >= 1) {
      const afterAm = am - 1;
      const afterPm = pm + 1;
      if (afterPm >= effectiveMinPm && afterPm >= afterAm) {
        const amCandidates = rows.filter((r) => {
          const cell = r.cells[dayIndex];
          return cell?.availability === 'WORK' && cell?.effectiveShift === 'MORNING';
        });
        if (amCandidates.length > 0) {
          const chosen = amCandidates[0];
          out.push({
            id: `move-${date}-${chosen.empId}`,
            type: 'MOVE',
            date,
            dayIndex,
            affected: [{ empId: chosen.empId, name: chosen.name, fromShift: 'MORNING', toShift: 'EVENING' }],
            before: { am, pm, rashidAm, rashidPm },
            after: { am: afterAm, pm: afterPm, rashidAm, rashidPm },
            reason: `AM (${am}) > PM (${pm}). Move ${chosen.name} from AM to PM → PM=${afterPm} ≥ 2.`,
            highlightCells: [cellKey(chosen.empId, date)],
          });
        }
      }
    }

    // 2) Friday PM-only: AM > 0 → MOVE one AM → PM
    if (isFriday && am >= 1) {
      const amCandidates = rows.filter((r) => {
        const cell = r.cells[dayIndex];
        return cell?.availability === 'WORK' && (cell?.effectiveShift === 'MORNING' || cell?.effectiveShift === 'COVER_RASHID_AM');
      });
      if (amCandidates.length > 0) {
        const chosen = amCandidates[0];
        const fromShift = chosen.cells[dayIndex]?.effectiveShift === 'COVER_RASHID_AM' ? 'COVER_RASHID_AM' : 'MORNING';
        out.push({
          id: `move-fri-am-pm-${date}-${chosen.empId}`,
          type: 'MOVE',
          date,
          dayIndex,
          affected: [{ empId: chosen.empId, name: chosen.name, fromShift, toShift: 'EVENING' }],
          before: { am, pm, rashidAm, rashidPm },
          after: { am: am - 1, pm: pm + 1, rashidAm, rashidPm },
          reason: `Friday is PM-only; AM (${am}) must be 0. Move ${chosen.name} from AM to PM.`,
          highlightCells: [cellKey(chosen.empId, date)],
        });
      }
    }

    // 3) Sat–Thu: PM < 2 or PM < AM → REMOVE_COVER Rashid PM to boutique PM
    if (!isFriday && (pm < effectiveMinPm || pm < am) && rashidPm >= 1) {
      const rashidPmRows = rows.filter((r) => {
        const cell = r.cells[dayIndex];
        return cell?.availability === 'WORK' && cell?.effectiveShift === 'COVER_RASHID_PM';
      });
      if (rashidPmRows.length > 0) {
        const chosen = rashidPmRows[0];
        out.push({
          id: `remove-cover-pm-${date}-${chosen.empId}`,
          type: 'REMOVE_COVER',
          date,
          dayIndex,
          affected: [{ empId: chosen.empId, name: chosen.name, fromShift: 'COVER_RASHID_PM', toShift: 'EVENING' }],
          before: { am, pm, rashidAm, rashidPm },
          after: { am, pm: pm + 1, rashidAm, rashidPm: rashidPm - 1 },
          reason: `PM (${pm}) below minimum (${effectiveMinPm}) or below AM. Cancel Rashid PM for ${chosen.name} → Boutique PM.`,
          highlightCells: [cellKey(chosen.empId, date)],
        });
      }
    }
  }

  return out;
}
