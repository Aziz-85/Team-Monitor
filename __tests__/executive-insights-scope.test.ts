/**
 * Executive Insights API: single-boutique scope by default.
 * - Uses resolveOperationalBoutiqueOnly (no global param for insights).
 * - Passes boutiqueIds to fetchWeekMetrics and fetchDailyRevenueForWeek.
 * - No scope leak: data filtered at source.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.join(process.cwd(), 'app', 'api', 'executive', 'insights', 'route.ts');

describe('Executive Insights API scope', () => {
  it('uses resolveOperationalBoutiqueOnly for scope', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('resolveOperationalBoutiqueOnly');
    expect(src).toContain('scopeResult.scope.boutiqueIds');
  });

  it('passes boutiqueIds to fetchWeekMetrics', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('fetchWeekMetrics(weekStart, todayStr, boutiqueIds)');
  });

  it('passes boutiqueIds to fetchDailyRevenueForWeek', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('fetchDailyRevenueForWeek(weekStart, boutiqueIds)');
  });

  it('does not use global param for data scope', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    // Insights uses operational boutique only; no resolveBoutiqueIdsWithOptionalGlobal
    expect(src).not.toContain('resolveBoutiqueIdsWithOptionalGlobal');
    expect(src).not.toContain('allowGlobal');
  });
});
