/**
 * Minimal tests for executive metrics: computeRiskIndex and detectAnomalies.
 */

import {
  computeRiskIndex,
  detectAnomalies,
  getWeekRange,
  getLastNWeeksRanges,
  computeSalesRiskIndex,
  getRevenueTrendDirection,
  getTargetGapMomentum,
  linearRegressionProjection,
  volatilityIndex,
} from '@/lib/executive/metrics';

describe('getWeekRange', () => {
  it('returns Saturday as weekStart for a date in week', () => {
    const d = new Date('2026-02-14T12:00:00Z'); // Saturday
    const r = getWeekRange(d);
    expect(r.weekStart).toBe('2026-02-14');
    expect(r.dateStrings).toHaveLength(7);
    expect(r.dateStrings[0]).toBe('2026-02-14');
    expect(r.dateStrings[6]).toBe('2026-02-20');
  });

  it('normalizes mid-week date to Saturday start', () => {
    const d = new Date('2026-02-18T12:00:00Z'); // Wednesday
    const r = getWeekRange(d);
    expect(r.weekStart).toBe('2026-02-14');
  });
});

describe('getLastNWeeksRanges', () => {
  it('returns n week ranges, most recent first', () => {
    const ref = new Date('2026-02-14T12:00:00Z');
    const ranges = getLastNWeeksRanges(3, ref);
    expect(ranges).toHaveLength(3);
    expect(ranges[0].weekStart).toBe('2026-02-14');
    expect(ranges[1].weekStart).toBe('2026-02-07');
    expect(ranges[2].weekStart).toBe('2026-01-31');
  });
});

describe('computeRiskIndex', () => {
  it('returns LOW when metrics are healthy', () => {
    const r = computeRiskIndex({
      achievementPct: 95,
      overduePct: 2,
      suspiciousPct: 0,
      scheduleBalancePct: 90,
      zoneCompliancePct: 100,
    });
    expect(r.level).toBe('LOW');
    expect(r.score).toBeLessThan(25);
    expect(r.reasons).toContain('executive.risk.reasonNone');
  });

  it('returns HIGH when achievement low and overdue high', () => {
    const r = computeRiskIndex({
      achievementPct: 60,
      overduePct: 25,
      suspiciousPct: 8,
      scheduleBalancePct: 40,
      zoneCompliancePct: 70,
    });
    expect(r.level).toBe('HIGH');
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('returns MED when some factors elevated', () => {
    const r = computeRiskIndex({
      achievementPct: 85,
      overduePct: 20,
      suspiciousPct: 4,
    });
    expect(r.level).toBe('MED');
    expect(r.score).toBeGreaterThanOrEqual(25);
    expect(r.score).toBeLessThan(50);
  });
});

describe('detectAnomalies', () => {
  it('returns empty when no anomalies', () => {
    const a = detectAnomalies({
      trendSeries: [
        { weekStart: '2026-02-14', achievementPct: 90, zoneCompliancePct: 95 },
        { weekStart: '2026-02-07', achievementPct: 88, zoneCompliancePct: 92 },
      ],
    });
    expect(a).toHaveLength(0);
  });

  it('detects zone compliance dip', () => {
    const a = detectAnomalies({
      trendSeries: [],
      zoneDips: [{ zoneCode: 'A', compliancePct: 70, weekStart: '2026-02-14' }],
    });
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((x) => x.kind === 'zone_compliance_dip')).toBe(true);
  });

  it('detects achievement drop week-over-week', () => {
    const a = detectAnomalies({
      trendSeries: [
        { weekStart: '2026-02-14', achievementPct: 60 },
        { weekStart: '2026-02-07', achievementPct: 85 },
      ],
    });
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('getRevenueTrendDirection', () => {
  it('returns uptrend when recent > older by 5%+', () => {
    expect(getRevenueTrendDirection([110, 100, 90])).toBe('uptrend');
  });
  it('returns downtrend when recent < older by 5%+', () => {
    expect(getRevenueTrendDirection([90, 95, 100])).toBe('downtrend');
  });
  it('returns flat when within 5%', () => {
    expect(getRevenueTrendDirection([102, 100, 99])).toBe('flat');
  });
});

describe('getTargetGapMomentum', () => {
  it('returns improving when gap shrunk', () => {
    expect(getTargetGapMomentum(50, 100)).toBe('improving');
  });
  it('returns worsening when gap grew', () => {
    expect(getTargetGapMomentum(100, 50)).toBe('worsening');
  });
  it('returns stable when same', () => {
    expect(getTargetGapMomentum(50, 50)).toBe('stable');
  });
});

describe('computeSalesRiskIndex', () => {
  it('returns Dominant when metrics strong', () => {
    const r = computeSalesRiskIndex({
      achievementPct: 100,
      revenueTrendDirection: 'uptrend',
      targetGapMomentum: 'improving',
      taskCompletionPct: 95,
      zoneCompliancePct: 100,
      disciplineScore: 100,
    });
    expect(r.level).toBe('Dominant');
    expect(r.score).toBeLessThan(15);
  });
  it('returns Critical when achievement low and downtrend', () => {
    const r = computeSalesRiskIndex({
      achievementPct: 50,
      revenueTrendDirection: 'downtrend',
      targetGapMomentum: 'worsening',
      taskCompletionPct: 60,
      zoneCompliancePct: 70,
      disciplineScore: 70,
    });
    expect(r.level).toBe('Critical');
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('linearRegressionProjection', () => {
  it('returns 2 projections for 4-week series', () => {
    const proj = linearRegressionProjection([100, 110, 120, 130], 2);
    expect(proj).toHaveLength(2);
    expect(proj[0].weekOffset).toBe(1);
    expect(proj[1].weekOffset).toBe(2);
  });
});

describe('volatilityIndex', () => {
  it('returns 0 for empty array', () => {
    expect(volatilityIndex([])).toBe(0);
  });
  it('returns 0 when mean is 0', () => {
    expect(volatilityIndex([0, 0, 0])).toBe(0);
  });
});
