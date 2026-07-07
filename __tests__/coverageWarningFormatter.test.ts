import {
  dedupeCoverageWarnings,
  formatCoverageWarnings,
  warningsFromSlotViolations,
  warningsFromValidationResults,
} from '@/lib/schedule/coverageWarningFormatter';

describe('coverageWarningFormatter', () => {
  it('collapses repeated PM slot violations into one day group', () => {
    const slots = warningsFromSlotViolations([
      { date: '2026-04-05', slotId: 'a', startTime: '17:30', endTime: '18:00', coverage: 0, minCoverage: 2 },
      { date: '2026-04-05', slotId: 'b', startTime: '18:00', endTime: '18:30', coverage: 0, minCoverage: 2 },
      { date: '2026-04-05', slotId: 'c', startTime: '18:30', endTime: '19:00', coverage: 0, minCoverage: 2 },
      { date: '2026-04-05', slotId: 'd', startTime: '19:00', endTime: '19:30', coverage: 0, minCoverage: 2 },
    ]);
    const formatted = formatCoverageWarnings(slots);
    expect(formatted.summaryLine).toContain('PM shortage');
    expect(formatted.totalAffectedDays).toBe(1);
    expect(formatted.groupedByDay[0]?.items.length).toBe(1);
    expect(formatted.groupedByDay[0]?.items[0]?.periodRange).toBe('17:30–19:30');
  });

  it('summarizes multiple PM days in one line', () => {
    const warnings = [
      ...warningsFromValidationResults('2026-04-05', [
        { type: 'MIN_PM', pmCount: 0, minPm: 2, amCount: 2 },
      ]),
      ...warningsFromValidationResults('2026-04-06', [
        { type: 'MIN_PM', pmCount: 1, minPm: 2, amCount: 2 },
      ]),
      ...warningsFromValidationResults('2026-04-07', [
        { type: 'MIN_PM', pmCount: 0, minPm: 2, amCount: 3 },
      ]),
    ];
    const formatted = formatCoverageWarnings(warnings);
    expect(formatted.summaryLine).toBe('Coverage needs attention: 3 days have PM shortage.');
    expect(formatted.compactItems.length).toBeLessThanOrEqual(3);
  });

  it('deduplicates identical messages', () => {
    const raw = [
      { date: '2026-04-05', type: 'MIN_PM', pmCount: 0, minPm: 2 },
      { date: '2026-04-05', type: 'MIN_PM', pmCount: 0, minPm: 2 },
    ];
    expect(dedupeCoverageWarnings(raw).length).toBe(1);
  });

  it('prefers bucket warning over per-slot spam for the same day', () => {
    const warnings = [
      ...warningsFromValidationResults('2026-04-05', [
        { type: 'MIN_PM', pmCount: 0, minPm: 2, amCount: 2 },
      ]),
      ...warningsFromSlotViolations([
        { date: '2026-04-05', slotId: 'x', startTime: '17:30', endTime: '18:00', coverage: 0, minCoverage: 2 },
      ]),
    ];
    const formatted = formatCoverageWarnings(warnings);
    expect(formatted.groupedByDay[0]?.items.length).toBe(1);
    expect(formatted.groupedByDay[0]?.items[0]?.label).toBe('PM coverage shortage');
  });

  it('returns null summary when no warnings', () => {
    const formatted = formatCoverageWarnings([]);
    expect(formatted.summaryLine).toBeNull();
    expect(formatted.totalAffectedDays).toBe(0);
  });
});
