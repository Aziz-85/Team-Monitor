import {
  computeForecast,
  computePaceMetrics,
  computeProductivityMetrics,
  effectiveDaysPassed,
} from '@/lib/analytics/performanceLayer';

describe('performanceLayer', () => {
  test('effectiveDaysPassed clamps to >= 1', () => {
    expect(effectiveDaysPassed(0, 31)).toBe(1);
    expect(effectiveDaysPassed(-3, 31)).toBe(1);
    expect(effectiveDaysPassed(15, 31)).toBe(15);
    expect(effectiveDaysPassed(50, 31)).toBe(31);
  });

  test('computeProductivityMetrics active days and contribution', () => {
    const p = computeProductivityMetrics({
      totalSalesMTD: 100000,
      activeDays: 10,
      boutiqueMTD: 400000,
    });
    expect(p.totalSalesMTD).toBe(100000);
    expect(p.activeDays).toBe(10);
    expect(p.avgDailySales).toBe(10000);
    expect(p.contributionPct).toBe(25);
  });

  test('computeProductivityMetrics zero sales', () => {
    const p = computeProductivityMetrics({
      totalSalesMTD: 0,
      activeDays: 0,
      boutiqueMTD: 1000,
    });
    expect(p.activeDays).toBe(0);
    expect(p.avgDailySales).toBe(0);
    expect(p.contributionPct).toBe(0);
  });

  test('computePaceMetrics beginning of month', () => {
    const m = computePaceMetrics({
      actualMTD: 50000,
      monthlyTarget: 310000,
      totalDaysInMonth: 31,
      daysPassed: 1,
    });
    expect(m.expectedToDate).toBe(Math.round(310000 / 31));
    expect(m.band).toBe('ahead');
  });

  test('computePaceMetrics bands', () => {
    const on = computePaceMetrics({
      actualMTD: 1000,
      monthlyTarget: 31000,
      totalDaysInMonth: 31,
      daysPassed: 1,
    });
    expect(on.paceRatio).not.toBeNull();
    if (on.paceRatio != null && on.paceRatio >= 0.95 && on.paceRatio <= 1.05) {
      expect(on.band).toBe('onTrack');
    }
  });

  test('computeForecast no division by zero', () => {
    const f = computeForecast({
      actualMTD: 0,
      monthlyTarget: 310000,
      totalDaysInMonth: 31,
      daysPassed: 0,
    });
    expect(Number.isFinite(f.forecastedTotal)).toBe(true);
    expect(f.avgDailyActual).toBe(0);
  });

  test('computeForecast mid month', () => {
    const f = computeForecast({
      actualMTD: 155000,
      monthlyTarget: 310000,
      totalDaysInMonth: 31,
      daysPassed: 15,
    });
    expect(f.avgDailyActual).toBe(Math.round(155000 / 15));
    expect(f.forecastedTotal).toBe(f.avgDailyActual * 31);
  });
});
