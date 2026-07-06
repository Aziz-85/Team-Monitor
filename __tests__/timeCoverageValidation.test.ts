import { validateTimeCoverageForGrid } from '@/lib/schedule/timeCoverageValidation';
import { buildDayCountContexts } from '@/lib/services/scheduleGrid';
import type { GridRow } from '@/lib/services/scheduleGrid';

describe('validateTimeCoverageForGrid', () => {
  const date = '2026-06-20';
  const dayCountContexts = buildDayCountContexts([date]);

  it('uses saved segments for slot coverage validation', () => {
    const periods = dayCountContexts[0]!.operatingPeriods;
    const rows: GridRow[] = ['e1', 'e2'].map((empId, idx) => ({
      empId,
      name: idx === 0 ? 'A' : 'B',
      team: 'A',
      effectiveWeeklyOffDay: 'NONE' as const,
      cells: [
        {
          date,
          availability: 'WORK' as const,
          effectiveShift: 'SPLIT' as const,
          overrideId: `o${idx + 1}`,
          baseShift: 'MORNING' as const,
          segments:
            periods.length >= 2
              ? [
                  { periodIndex: 0, startTime: periods[0].startTime, endTime: periods[0].endTime },
                  { periodIndex: 1, startTime: periods[1].startTime, endTime: periods[1].endTime },
                ]
              : [{ periodIndex: 0, startTime: '09:30', endTime: '22:30' }],
        },
      ],
    }));

    const { valid } = validateTimeCoverageForGrid(rows, dayCountContexts);
    expect(valid).toBe(true);
  });

  it('reports slot violations when coverage is insufficient', () => {
    const rows: GridRow[] = [
      {
        empId: 'e1',
        name: 'A',
        team: 'A',
        effectiveWeeklyOffDay: 'NONE',
        cells: [
          {
            date,
            availability: 'WORK',
            effectiveShift: 'MORNING',
            overrideId: null,
            baseShift: 'MORNING',
            segments: [{ periodIndex: 0, startTime: '09:30', endTime: '13:30' }],
          },
        ],
      },
    ];

    const { valid, violations } = validateTimeCoverageForGrid(rows, dayCountContexts);
    expect(valid).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].minCoverage).toBe(2);
  });
});
