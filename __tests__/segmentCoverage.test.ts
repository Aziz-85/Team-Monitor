import {
  segmentsAmPmContribution,
  shiftAmPmContribution,
  shiftToSegmentsForCounting,
  segmentsToGridShiftEnum,
} from '@/lib/schedule/segmentCoverage';
import { operatingPeriodsForDay, FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';

describe('segmentCoverage counting', () => {
  it('SPLIT on ramadan day counts both AM and PM from period segments', () => {
    const periods = operatingPeriodsForDay(6, true);
    const segments = [
      { periodIndex: 0, startTime: '11:30', endTime: '17:30' },
      { periodIndex: 1, startTime: '20:30', endTime: '02:30' },
    ];
    const contrib = segmentsAmPmContribution(segments, periods, 6, true);
    expect(contrib.am).toBe(true);
    expect(contrib.pm).toBe(true);
    expect(segmentsToGridShiftEnum(segments, periods, 6, true)).toBe('SPLIT');
  });

  it('MORNING on normal single-period day counts AM only', () => {
    const periods = operatingPeriodsForDay(6, false);
    const segments = shiftToSegmentsForCounting('MORNING', periods, 8);
    const contrib = shiftAmPmContribution('MORNING', periods, 6, false, 8, segments);
    expect(contrib.am).toBe(true);
    expect(contrib.pm).toBe(false);
  });

  it('EVENING on normal single-period day counts PM only', () => {
    const periods = operatingPeriodsForDay(6, false);
    const segments = shiftToSegmentsForCounting('EVENING', periods, 8);
    const contrib = shiftAmPmContribution('EVENING', periods, 6, false, 8, segments);
    expect(contrib.am).toBe(false);
    expect(contrib.pm).toBe(true);
  });

  it('Friday normal evening-only period counts PM not AM', () => {
    const periods = operatingPeriodsForDay(FRIDAY_DOW, false);
    const segments = shiftToSegmentsForCounting('EVENING', periods, 8);
    const contrib = shiftAmPmContribution('EVENING', periods, FRIDAY_DOW, false, 8, segments);
    expect(contrib.am).toBe(false);
    expect(contrib.pm).toBe(true);
  });

  it('SPLIT enum on normal weekday counts AM and PM from reconstructed segments', () => {
    const periods = operatingPeriodsForDay(6, false);
    const contrib = shiftAmPmContribution('SPLIT', periods, 6, false);
    expect(contrib.am).toBe(true);
    expect(contrib.pm).toBe(true);
  });
});
