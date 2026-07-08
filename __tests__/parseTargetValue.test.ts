import { parseTargetValue } from '@/lib/targets/parseTargetValue';

describe('parseTargetValue', () => {
  it('accepts integer strings and numbers', () => {
    expect(parseTargetValue('2200000')).toEqual({ kind: 'value', value: 2200000 });
    expect(parseTargetValue('0')).toEqual({ kind: 'value', value: 0 });
    expect(parseTargetValue('150000')).toEqual({ kind: 'value', value: 150000 });
    expect(parseTargetValue(0)).toEqual({ kind: 'value', value: 0 });
    expect(parseTargetValue('2,200,000')).toEqual({ kind: 'value', value: 2200000 });
  });

  it('treats empty as empty', () => {
    expect(parseTargetValue('')).toEqual({ kind: 'empty' });
    expect(parseTargetValue('   ')).toEqual({ kind: 'empty' });
    expect(parseTargetValue(null)).toEqual({ kind: 'empty' });
  });

  it('rejects non-numeric text', () => {
    expect(parseTargetValue('abc')).toEqual({ kind: 'error', message: 'Target must be a number' });
    expect(parseTargetValue('OFFICIAL')).toEqual({ kind: 'error', message: 'Target must be a number' });
  });
});
