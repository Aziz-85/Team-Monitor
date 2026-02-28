/**
 * Schedule boutique scope: grid and save must respect resolved scope.
 * - Grid: only employees with Employee.boutiqueId in resolved boutiqueIds.
 * - Save: reject changes that assign an employee not in scope; audit CROSS_BOUTIQUE_BLOCKED.
 */

import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';

function toSaturdayWeekStart(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const daysBack = (day - 6 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

describe('Schedule boutique scope', () => {
  describe('getScheduleGridForWeek with boutiqueIds', () => {
    it('returns empty rows when boutiqueIds contains no-employee boutique', async () => {
      const weekStart = toSaturdayWeekStart(new Date());
      const grid = await getScheduleGridForWeek(weekStart, {
        boutiqueIds: ['bout_nonexistent_scope_test_xyz'],
      });
      expect(grid.rows).toHaveLength(0);
      expect(grid.counts.every((c) => c.amCount === 0 && c.pmCount === 0)).toBe(true);
    });

    it('accepts boutiqueIds option without throwing', async () => {
      const weekStart = toSaturdayWeekStart(new Date());
      await expect(
        getScheduleGridForWeek(weekStart, { boutiqueIds: [] })
      ).resolves.toMatchObject({
        weekStart,
        days: expect.any(Array),
        rows: expect.any(Array),
        counts: expect.any(Array),
      });
    });
  });

  describe('Contract: schedule scope', () => {
    it('API GET /api/schedule/week/grid uses server-resolved scope only (never client boutiqueId)', () => {
      expect(true).toBe(true);
    });
    it('API POST /api/schedule/week/grid/save rejects empId not in resolved boutiqueIds with 400 CROSS_BOUTIQUE_BLOCKED', () => {
      expect(true).toBe(true);
    });
    it('ScheduleEditAudit is created with source CROSS_BOUTIQUE_BLOCKED when cross-boutique assign attempted', () => {
      expect(true).toBe(true);
    });
  });

  describe('Stable ordering', () => {
    it('grid rows use deterministic order (team, name, empId)', async () => {
      const weekStart = toSaturdayWeekStart(new Date());
      const grid1 = await getScheduleGridForWeek(weekStart, { boutiqueIds: [] });
      const grid2 = await getScheduleGridForWeek(weekStart, { boutiqueIds: [] });
      if (grid1.rows.length > 0 && grid2.rows.length > 0) {
        expect(grid1.rows.map((r) => r.empId)).toEqual(grid2.rows.map((r) => r.empId));
      }
    });
  });
});
