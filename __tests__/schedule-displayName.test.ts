import {
  buildScheduleDisplayNames,
  formatCoverageName,
  getFamilyName,
  getFirstName,
  getMeaningfulFamilyInitial,
} from '@/lib/schedule/displayName';

describe('schedule displayName', () => {
  it('getFirstName returns first token', () => {
    expect(getFirstName('Abdulaziz Alnasser')).toBe('Abdulaziz');
    expect(getFirstName('Dr. Sara Ahmed')).toBe('Sara');
  });

  it('getFamilyName returns remainder after first name', () => {
    expect(getFamilyName('Hussain Almarhon')).toBe('Almarhon');
    expect(getFamilyName('Madonna')).toBe('');
  });

  it('getMeaningfulFamilyInitial skips leading Al', () => {
    expect(getMeaningfulFamilyInitial('Almarhon')).toBe('M');
    expect(getMeaningfulFamilyInitial('Alrashdi')).toBe('R');
    expect(getMeaningfulFamilyInitial('Alghamdi')).toBe('G');
    expect(getMeaningfulFamilyInitial('Alnasser')).toBe('N');
    expect(getMeaningfulFamilyInitial('Alkuaibi')).toBe('K');
    expect(getMeaningfulFamilyInitial('Rashdi')).toBe('R');
  });

  it('uses first name only when unique', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Abdulaziz Alnasser' },
      { empId: 'e2', name: 'AlAnoud Alqahtani' },
    ]);
    expect(map.get('e1')).toBe('Abdulaziz');
    expect(map.get('e2')).toBe('AlAnoud');
  });

  it('disambiguates with meaningful family initial', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Hussain Almarhon' },
      { empId: 'e2', name: 'Hussain Alrashdi' },
    ]);
    expect(map.get('e1')).toBe('Hussain M.');
    expect(map.get('e2')).toBe('Hussain R.');
  });

  it('disambiguates non-Al surnames with meaningful initial', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Hussain Almarhon' },
      { empId: 'e2', name: 'Hussain Rashdi' },
    ]);
    expect(map.get('e1')).toBe('Hussain M.');
    expect(map.get('e2')).toBe('Hussain R.');
  });

  it('falls back to longer family prefix when meaningful letters still collide', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Ali Alhadi' },
      { empId: 'e2', name: 'Ali Alharbi' },
    ]);
    expect(map.get('e1')).toBe('Ali Alhad.');
    expect(map.get('e2')).toBe('Ali Alhar.');
    expect(map.get('e1')).not.toBe(map.get('e2'));
  });

  it('formatCoverageName shortens guest lines', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'g1', name: 'Abdulmoniem Almulhim' },
      { empId: 'g2', name: 'Mahmoud Alkuaibi' },
    ]);
    expect(formatCoverageName('Abdulmoniem Almulhim', 'AM', map, 'g1')).toMatchObject({
      text: 'Abdulmoniem AM',
      title: 'Abdulmoniem Almulhim',
      isSplit: false,
    });
    expect(formatCoverageName('Mahmoud Alkuaibi', 'PM', map, 'g2')).toMatchObject({
      text: 'Mahmoud PM',
      isSplit: false,
    });
  });

  it('formatCoverageName disambiguates duplicate first names', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'g1', name: 'Hussain Alrashdi' },
      { empId: 'g2', name: 'Hussain Almarhon' },
    ]);
    expect(formatCoverageName('Hussain Alrashdi', 'AM', map, 'g1').text).toBe('Hussain R. AM');
    expect(formatCoverageName('Hussain Almarhon', 'PM', map, 'g2').text).toBe('Hussain M. PM');
  });

  it('formatCoverageName marks split coverage', () => {
    const label = formatCoverageName('Abdulaziz Alnasser', 'SPLIT');
    expect(label.text).toBe('Abdulaziz');
    expect(label.isSplit).toBe(true);
    expect(label.title).toBe('Abdulaziz Alnasser — Split Shift');
  });
});
