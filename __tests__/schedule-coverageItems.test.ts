import {
  buildCoverageByDay,
  guestToCoverageItem,
  normalizeGuestCoverageShift,
} from '@/lib/schedule/coverageItems';

describe('coverageItems', () => {
  const guest = {
    id: 'g1',
    date: '2026-06-21',
    empId: 'e1',
    shift: 'MORNING',
    sourceBoutique: { name: 'Rashid Boutique' },
    employee: { name: 'Hussain Almarhon', homeBoutiqueName: 'Rashid Boutique' },
  };

  it('normalizeGuestCoverageShift maps morning/evening and split', () => {
    expect(normalizeGuestCoverageShift('MORNING')).toBe('AM');
    expect(normalizeGuestCoverageShift('EVENING')).toBe('PM');
    expect(normalizeGuestCoverageShift('SPLIT')).toBe('SPLIT');
    expect(normalizeGuestCoverageShift('UNKNOWN')).toBeNull();
  });

  it('guestToCoverageItem shapes structured coverage data', () => {
    const item = guestToCoverageItem(guest, { destinationBoutique: 'Dhahran Mall', locale: 'en' });
    expect(item).toMatchObject({
      id: 'g1',
      employeeId: 'e1',
      fullName: 'Hussain Almarhon',
      shift: 'AM',
      sourceBoutique: 'Rashid Boutique',
      destinationBoutique: 'Dhahran Mall',
    });
  });

  it('buildCoverageByDay groups by date', () => {
    const byDay = buildCoverageByDay(
      [
        guest,
        { ...guest, id: 'g2', date: '2026-06-22', shift: 'EVENING' },
      ],
      { destinationBoutique: 'Dhahran Mall', locale: 'en' }
    );
    expect(byDay['2026-06-21']).toHaveLength(1);
    expect(byDay['2026-06-22']?.[0]?.shift).toBe('PM');
  });
});
