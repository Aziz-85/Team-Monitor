/**
 * Schedule view/editor: count definitions, Friday rule, coverage exclusion.
 * Uses exported computeDayCountsFromCells from scheduleGrid as single source of truth.
 */

import { isFriday, isAmShiftForbiddenOnDate, FRIDAY_DAY_OF_WEEK } from '@/lib/services/shift';
import { computeDayCountsFromCells, computeCountsFromGridRows } from '@/lib/services/scheduleGrid';

function computeCountsForDay(cells: Array<{ availability: string; effectiveShift: string }>) {
  return computeDayCountsFromCells(cells);
}

function buildListsForDay(cells: Array<{ name: string; availability: string; effectiveShift: string }>): {
  morning: string[];
  evening: string[];
  rashidAm: string[];
  rashidPm: string[];
} {
  const morning: string[] = [];
  const evening: string[] = [];
  const rashidAm: string[] = [];
  const rashidPm: string[] = [];
  for (const cell of cells) {
    if (cell.availability !== 'WORK') continue;
    if (cell.effectiveShift === 'MORNING') morning.push(cell.name);
    if (cell.effectiveShift === 'EVENING') evening.push(cell.name);
    if (cell.effectiveShift === 'COVER_RASHID_AM') rashidAm.push(cell.name);
    if (cell.effectiveShift === 'COVER_RASHID_PM') rashidPm.push(cell.name);
  }
  return { morning, evening, rashidAm, rashidPm };
}

describe('schedule counts and Friday rule', () => {
  describe('D1: Coverage count exclusion', () => {
    it('COVER_RASHID_PM does not increase boutique pmCount, rashidPMCount is 1', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_PM' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.pmCount).toBe(0);
      expect(counts.rashidPmCount).toBe(1);
    });

    it('COVER_RASHID_AM does not increase boutique amCount, rashidAMCount is 1', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_AM' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(0);
      expect(counts.rashidAmCount).toBe(1);
    });

    it('NONE does not count', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'NONE' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(0);
      expect(counts.pmCount).toBe(0);
      expect(counts.rashidAmCount).toBe(0);
      expect(counts.rashidPmCount).toBe(0);
    });

    it('LEAVE/OFF/ABSENT do not count', () => {
      const cells = [
        { availability: 'LEAVE', effectiveShift: 'MORNING' as const },
        { availability: 'OFF', effectiveShift: 'EVENING' as const },
        { availability: 'ABSENT', effectiveShift: 'MORNING' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(0);
      expect(counts.pmCount).toBe(0);
    });

    it('employee availability=LEAVE but effectiveShift=MORNING => AM count must remain 0', () => {
      const cells = [{ availability: 'LEAVE', effectiveShift: 'MORNING' as const }];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(0);
    });

    it('employee availability=WORK and shift=MORNING => AM count increments', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'MORNING' as const },
        { availability: 'WORK', effectiveShift: 'MORNING' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(2);
    });
  });

  describe('D2: Friday blocking', () => {
    it('isFriday returns true for Friday (day 5)', () => {
      const friday = new Date('2026-02-06T12:00:00Z'); // Friday
      expect(friday.getUTCDay()).toBe(FRIDAY_DAY_OF_WEEK);
      expect(isFriday(friday)).toBe(true);
    });

    it('isFriday returns false for Saturday', () => {
      const sat = new Date('2026-02-07T12:00:00Z');
      expect(isFriday(sat)).toBe(false);
    });

    it('isAmShiftForbiddenOnDate rejects MORNING and COVER_RASHID_AM on Friday (PM-only)', () => {
      const friday = new Date('2026-04-03T00:00:00Z'); // Friday outside Ramadan
      expect(isAmShiftForbiddenOnDate(friday, 'MORNING')).toBe(true);
      expect(isAmShiftForbiddenOnDate(friday, 'COVER_RASHID_AM')).toBe(true);
      expect(isAmShiftForbiddenOnDate(friday, 'EVENING')).toBe(false);
      expect(isAmShiftForbiddenOnDate(friday, 'COVER_RASHID_PM')).toBe(false);
      expect(isAmShiftForbiddenOnDate(friday, 'NONE')).toBe(false);
    });

    it('isAmShiftForbiddenOnDate allows AM on non-Friday', () => {
      const saturday = new Date('2026-04-04T00:00:00Z');
      expect(isAmShiftForbiddenOnDate(saturday, 'MORNING')).toBe(false);
      expect(isAmShiftForbiddenOnDate(saturday, 'COVER_RASHID_AM')).toBe(false);
    });
  });

  describe('D3: Count integrity (list lengths == computed counts)', () => {
    it('rendered list lengths equal computed counts for each day', () => {
      const cellsWithNames = [
        { name: 'Alice', availability: 'WORK', effectiveShift: 'MORNING' },
        { name: 'Bob', availability: 'WORK', effectiveShift: 'MORNING' },
        { name: 'Carol', availability: 'WORK', effectiveShift: 'EVENING' },
        { name: 'Dave', availability: 'WORK', effectiveShift: 'COVER_RASHID_PM' },
      ];
      const counts = computeCountsForDay(cellsWithNames);
      const lists = buildListsForDay(cellsWithNames);
      expect(lists.morning.length).toBe(counts.amCount);
      expect(lists.evening.length).toBe(counts.pmCount);
      expect(lists.rashidAm.length).toBe(counts.rashidAmCount);
      expect(lists.rashidPm.length).toBe(counts.rashidPmCount);
      expect(counts.amCount).toBe(2);
      expect(counts.pmCount).toBe(1);
      expect(counts.rashidPmCount).toBe(1);
    });

    it('empty WORK day has all counts 0', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'NONE' },
      ];
      const counts = computeCountsForDay(cells);
      const lists = buildListsForDay(cells.map((c, i) => ({ ...c, name: `E${i}` })));
      expect(lists.morning.length).toBe(0);
      expect(counts.amCount).toBe(0);
      expect(counts.pmCount).toBe(0);
    });

    it('coverage count increments only for COVER_RASHID_AM and COVER_RASHID_PM', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_AM' as const },
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_PM' as const },
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_AM' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(0);
      expect(counts.pmCount).toBe(0);
      expect(counts.rashidAmCount).toBe(2);
      expect(counts.rashidPmCount).toBe(1);
    });

    it('boutique AM/PM counts exclude cover shifts', () => {
      const cells = [
        { availability: 'WORK', effectiveShift: 'MORNING' as const },
        { availability: 'WORK', effectiveShift: 'EVENING' as const },
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_AM' as const },
        { availability: 'WORK', effectiveShift: 'COVER_RASHID_PM' as const },
      ];
      const counts = computeCountsForDay(cells);
      expect(counts.amCount).toBe(1);
      expect(counts.pmCount).toBe(1);
      expect(counts.rashidAmCount).toBe(1);
      expect(counts.rashidPmCount).toBe(1);
    });

    it('same input => same counts: computeCountsFromGridRows matches computeDayCountsFromCells per day', () => {
      const rows = [
        {
          empId: 'E1',
          cells: [
            { date: '2026-02-07', availability: 'WORK', effectiveShift: 'MORNING' },
            { date: '2026-02-08', availability: 'WORK', effectiveShift: 'EVENING' },
          ],
        },
        {
          empId: 'E2',
          cells: [
            { date: '2026-02-07', availability: 'WORK', effectiveShift: 'MORNING' },
            { date: '2026-02-08', availability: 'OFF', effectiveShift: 'NONE' },
          ],
        },
      ];
      const fromGrid = computeCountsFromGridRows(rows);
      const day0Cells = rows.map((r) => ({ availability: r.cells[0].availability, effectiveShift: r.cells[0].effectiveShift }));
      const day1Cells = rows.map((r) => ({ availability: r.cells[1].availability, effectiveShift: r.cells[1].effectiveShift }));
      expect(computeDayCountsFromCells(day0Cells).amCount).toBe(fromGrid[0].amCount);
      expect(computeDayCountsFromCells(day0Cells).pmCount).toBe(fromGrid[0].pmCount);
      expect(computeDayCountsFromCells(day1Cells).amCount).toBe(fromGrid[1].amCount);
      expect(computeDayCountsFromCells(day1Cells).pmCount).toBe(fromGrid[1].pmCount);
      expect(fromGrid[0].amCount).toBe(2);
      expect(fromGrid[0].pmCount).toBe(0);
      expect(fromGrid[1].amCount).toBe(0);
      expect(fromGrid[1].pmCount).toBe(1);
    });
  });
});
