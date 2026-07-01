/**
 * Shared shift dropdown options for schedule editor cells and guest coverage.
 */

import { isFriday } from '@/lib/services/shift';
import { isDateInRamadanRange } from '@/lib/time/ramadan';

export type ShiftOption = { value: string; label: string };

type LabelFn = (key: string) => string;

export function buildEditorShiftOptions(input: {
  date: string;
  ramadanRange: { start: string; end: string } | null;
  t: LabelFn;
  includeReset?: boolean;
  resetLabel?: string;
  /** When false, omit Split (e.g. Friday PM-only). Default true on non-Friday. */
  includeSplit?: boolean;
}): ShiftOption[] {
  const { date, ramadanRange, t } = input;
  const ramadanDay = ramadanRange ? isDateInRamadanRange(new Date(date + 'T12:00:00Z'), ramadanRange) : false;
  const friday = isFriday(new Date(date + 'T12:00:00Z'));
  const am = t('schedule.amShort');
  const pm = t('schedule.pmShort');
  const split = t('schedule.splitShift');
  const none = t('schedule.none');

  if (friday && !ramadanDay) {
    return [{ value: 'EVENING', label: pm }, { value: 'NONE', label: none }];
  }

  const options: ShiftOption[] = [
    { value: 'MORNING', label: am },
    { value: 'EVENING', label: pm },
  ];
  if (input.includeSplit !== false) {
    options.push({ value: 'SPLIT', label: split });
  }
  options.push({ value: 'NONE', label: none });
  if (input.includeReset && input.resetLabel) {
    options.push({ value: 'RESET', label: input.resetLabel });
  }
  return options;
}

export function guestShiftLabel(shift: string, t: LabelFn): string {
  if (shift === 'MORNING') return t('schedule.amShort');
  if (shift === 'EVENING') return t('schedule.pmShort');
  if (shift === 'SPLIT') return t('schedule.splitShift');
  return shift;
}
