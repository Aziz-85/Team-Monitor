/**
 * Unit tests for Boutique Targets API: pct math and clamping.
 */

import {
  computePct,
  remainingPctDisplay,
} from '@/lib/sales/targetsPct';

describe('computePct', () => {
  it('returns 0 when targetSar is 0', () => {
    expect(computePct(100, 0)).toBe(0);
    expect(computePct(0, 0)).toBe(0);
  });

  it('returns 0 when targetSar is negative', () => {
    expect(computePct(50, -1)).toBe(0);
  });

  it('returns floor of (achieved * 100 / target)', () => {
    expect(computePct(50, 100)).toBe(50);
    expect(computePct(100, 100)).toBe(100);
    expect(computePct(150, 100)).toBe(150);
    expect(computePct(33, 100)).toBe(33);
    expect(computePct(33, 99)).toBe(33);
    expect(computePct(1, 3)).toBe(33);
  });

  it('handles achieved > target (pct > 100)', () => {
    expect(computePct(200, 100)).toBe(200);
    expect(computePct(16900, 10000)).toBe(169);
  });

  it('uses integer division (floor)', () => {
    expect(computePct(1, 2)).toBe(50);
    expect(computePct(1, 3)).toBe(33);
    expect(computePct(2, 3)).toBe(66);
  });
});

describe('remainingPctDisplay', () => {
  it('returns 100 - min(pct, 100) for progress bar display', () => {
    expect(remainingPctDisplay(0)).toBe(100);
    expect(remainingPctDisplay(50)).toBe(50);
    expect(remainingPctDisplay(100)).toBe(0);
  });

  it('clamps at 100 so bar width never exceeds 100%', () => {
    expect(remainingPctDisplay(150)).toBe(0);
    expect(remainingPctDisplay(200)).toBe(0);
    expect(remainingPctDisplay(169)).toBe(0);
  });
});
