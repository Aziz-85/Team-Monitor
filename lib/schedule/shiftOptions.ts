/**
 * Shared shift dropdown options for schedule editor cells and guest coverage.
 */

import { isFriday } from '@/lib/services/shift';
import { isDateInRamadanRange } from '@/lib/time/ramadan';

export type ShiftOption = { value: string; label: string };

type LabelFn = (key: string) => string;

const SHIFT_LABEL_FALLBACKS: Record<string, string> = {
  amShort: 'AM',
  pmShort: 'PM',
  splitShift: 'Split Shift',
  none: 'NONE',
};

function shiftT(t: LabelFn, key: keyof typeof SHIFT_LABEL_FALLBACKS): string {
  const fullKey = `schedule.shift.${key}`;
  const value = t(fullKey);
  return value && value !== fullKey ? value : SHIFT_LABEL_FALLBACKS[key] ?? key;
}

export function buildEditorShiftOptions(input: {
  date: string;
  ramadanRange: { start: string; end: string } | null;
  t: LabelFn;
  includeReset?: boolean;
  resetLabel?: string;
  /** Keep Split visible when cell already has Split (e.g. fix legacy assignment). */
  forceIncludeSplit?: boolean;
}): ShiftOption[] {
  const { date, ramadanRange, t } = input;
  const ramadanDay = ramadanRange ? isDateInRamadanRange(new Date(date + 'T12:00:00Z'), ramadanRange) : false;
  const friday = isFriday(new Date(date + 'T12:00:00Z'));
  const am = shiftT(t, 'amShort');
  const pm = shiftT(t, 'pmShort');
  const split = shiftT(t, 'splitShift');
  const none = shiftT(t, 'none');

  if (friday && !ramadanDay) {
    return [{ value: 'EVENING', label: pm }, { value: 'NONE', label: none }];
  }

  const options: ShiftOption[] = [
    { value: 'MORNING', label: am },
    { value: 'EVENING', label: pm },
    { value: 'SPLIT', label: split },
    { value: 'NONE', label: none },
  ];
  if (input.includeReset && input.resetLabel) {
    options.push({ value: 'RESET', label: input.resetLabel });
  }
  return options;
}

export function guestShiftLabel(shift: string, t: LabelFn): string {
  if (shift === 'MORNING') return shiftT(t, 'amShort');
  if (shift === 'EVENING') return shiftT(t, 'pmShort');
  if (shift === 'SPLIT') return shiftT(t, 'splitShift');
  return shift;
}
