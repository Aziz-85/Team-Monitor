/**
 * Shared schedule shift rules — coverage counts, list assignment, editor validation.
 * Single source for SPLIT and boutique AM/PM counting.
 */

import type { ShiftType } from '@/lib/services/shift';
import { isFriday, isAmShiftForbiddenOnDate } from '@/lib/services/shift';

/** Shifts assignable in Schedule Editor (excludes legacy COVER_RASHID_*). */
export const EDITOR_OVERRIDE_SHIFTS = ['MORNING', 'EVENING', 'SPLIT', 'NONE'] as const;
export type EditorOverrideShift = (typeof EDITOR_OVERRIDE_SHIFTS)[number];

export type ShiftCountBucket = {
  amCount: number;
  pmCount: number;
  rashidAmCount: number;
  rashidPmCount: number;
};

export function normalizeShiftToken(shift: string): string {
  const raw = shift.trim().toUpperCase();
  if (raw === 'AM') return 'MORNING';
  if (raw === 'PM') return 'EVENING';
  return raw;
}

export function isEditorOverrideShift(shift: string): shift is EditorOverrideShift {
  return (EDITOR_OVERRIDE_SHIFTS as readonly string[]).includes(normalizeShiftToken(shift));
}

export function isWorkingBoutiqueShift(shift: string): boolean {
  const s = normalizeShiftToken(shift);
  return s === 'MORNING' || s === 'EVENING' || s === 'SPLIT';
}

/** SPLIT includes an AM block — forbidden on PM-only Fridays. */
export function isOverrideShiftForbiddenOnDate(date: Date, shift: string): boolean {
  const s = normalizeShiftToken(shift) as ShiftType;
  if (s === 'SPLIT') return isFriday(date);
  return isAmShiftForbiddenOnDate(date, s as 'MORNING' | 'COVER_RASHID_AM');
}

/**
 * @deprecated Engine v3: legacy enum-bucket counter. Kept only as a fallback for callers
 * without DayCountContext. All server paths must pass dayCountContexts so counts derive
 * from segments (lib/schedule/segmentCoverage.ts).
 */
export function incrementCountsForWorkingShift(counts: ShiftCountBucket, shift: string): void {
  const s = normalizeShiftToken(shift);
  if (s === 'MORNING') counts.amCount++;
  else if (s === 'EVENING') counts.pmCount++;
  else if (s === 'SPLIT') {
    counts.amCount++;
    counts.pmCount++;
  } else if (s === 'COVER_RASHID_AM') counts.rashidAmCount++;
  else if (s === 'COVER_RASHID_PM') counts.rashidPmCount++;
}

/** Morning column / AM list (Friday excludes AM + SPLIT). */
export function contributesToMorningList(shift: string, isFridayDay: boolean): boolean {
  if (isFridayDay) return false;
  const s = normalizeShiftToken(shift);
  return s === 'MORNING' || s === 'SPLIT';
}

/** Evening column / PM list. */
export function contributesToEveningList(shift: string): boolean {
  const s = normalizeShiftToken(shift);
  return s === 'EVENING' || s === 'SPLIT';
}

export function isSplitShift(shift: string): boolean {
  return normalizeShiftToken(shift) === 'SPLIT';
}

/** Excel / compact display token. */
export function excelShiftLabel(shift: string): 'AM' | 'PM' | 'SPLIT' | null {
  const s = normalizeShiftToken(shift);
  if (s === 'MORNING') return 'AM';
  if (s === 'EVENING') return 'PM';
  if (s === 'SPLIT') return 'SPLIT';
  return null;
}
