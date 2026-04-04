import { buildOperationalPaceDailyRows } from '@/lib/reports/operationalPaceDailyTable';

describe('buildOperationalPaceDailyRows', () => {
  it('carries shortfall forward only; fixed base from calendar spread', () => {
    const map = new Map<string, number>();
    map.set('2026-04-01', 15_000);
    map.set('2026-04-02', 0);
    const rows = buildOperationalPaceDailyRows({
      monthKey: '2026-04',
      monthTargetSar: 775_000,
      daysInMonth: 30,
      achievedByDateKey: map,
    });
    const d1 = rows.find((r) => r.dateKey === '2026-04-01')!;
    const d2 = rows.find((r) => r.dateKey === '2026-04-02')!;
    expect(d1.baseDailyTargetSar).toBe(25_834);
    expect(d1.carryInSar).toBe(0);
    expect(d1.effectiveDailyTargetSar).toBe(25_834);
    expect(d1.remainingSar).toBe(25_834 - 15_000);
    expect(d2.carryInSar).toBe(10_834);
    expect(d2.baseDailyTargetSar).toBe(25_834);
    expect(d2.effectiveDailyTargetSar).toBe(25_834 + 10_834);
  });

  it('does not carry surplus; zero carry when overachieved', () => {
    const map = new Map<string, number>();
    map.set('2026-04-01', 50_000);
    const rows = buildOperationalPaceDailyRows({
      monthKey: '2026-04',
      monthTargetSar: 75_000,
      daysInMonth: 3,
      achievedByDateKey: map,
    });
    const d1 = rows[0]!;
    const d2 = rows[1]!;
    expect(d1.remainingSar).toBeLessThan(0);
    expect(d2.carryInSar).toBe(0);
  });
});
