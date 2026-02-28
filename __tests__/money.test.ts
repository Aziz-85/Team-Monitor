/**
 * Money display utility: halalas → SAR string (whole SAR only, no decimals).
 */

import { formatSarFromHalala } from '@/lib/utils/money';

describe('formatSarFromHalala', () => {
  it('converts halalas to whole SAR with thousands separator', () => {
    expect(formatSarFromHalala(191950)).toBe('1,920 SAR');
    expect(formatSarFromHalala(17023500)).toBe('170,235 SAR');
    expect(formatSarFromHalala(19000000)).toBe('190,000 SAR');
  });

  it('formats zero as "0 SAR"', () => {
    expect(formatSarFromHalala(0)).toBe('0 SAR');
  });

  it('formats small halalas as rounded SAR (no decimals)', () => {
    expect(formatSarFromHalala(50)).toBe('1 SAR');
    expect(formatSarFromHalala(1)).toBe('0 SAR');
  });

  it('returns "—" for non-finite input', () => {
    expect(formatSarFromHalala(NaN)).toBe('—');
    expect(formatSarFromHalala(Infinity)).toBe('—');
  });
});
