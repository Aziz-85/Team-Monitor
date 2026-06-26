import {
  buildScheduleDisplayNames,
  getFamilyName,
  getFirstName,
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

  it('uses first name only when unique', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Abdulaziz Alnasser' },
      { empId: 'e2', name: 'AlAnoud Alqahtani' },
    ]);
    expect(map.get('e1')).toBe('Abdulaziz');
    expect(map.get('e2')).toBe('AlAnoud');
  });

  it('disambiguates with family initial when unique', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Hussain Almarhon' },
      { empId: 'e2', name: 'Hussain Rashdi' },
    ]);
    expect(map.get('e1')).toBe('Hussain A.');
    expect(map.get('e2')).toBe('Hussain R.');
  });

  it('extends prefix for Al- surnames that share the same initial', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Hussain Almarhon' },
      { empId: 'e2', name: 'Hussain Alrashdi' },
    ]);
    expect(map.get('e1')).toBe('Hussain Alm.');
    expect(map.get('e2')).toBe('Hussain Alr.');
  });

  it('extends family prefix when initial is not enough', () => {
    const map = buildScheduleDisplayNames([
      { empId: 'e1', name: 'Ali Alhadi' },
      { empId: 'e2', name: 'Ali Alharbi' },
    ]);
    expect(map.get('e1')).toMatch(/^Ali Al/);
    expect(map.get('e2')).toMatch(/^Ali Al/);
    expect(map.get('e1')).not.toBe(map.get('e2'));
  });
});
