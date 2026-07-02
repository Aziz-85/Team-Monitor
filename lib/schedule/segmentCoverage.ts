/**
 * AM/PM coverage counting from shift segments and operating periods.
 * Grid counts derive from actual time overlap, not enum labels alone.
 */

import type { OperatingPeriod, ShiftSegment } from '@/lib/schedule/generateSchedule/types';
import {
  parseTimeToMinutes,
  periodBounds,
  segmentFromPeriodEnd,
  segmentFromPeriodStart,
} from '@/lib/schedule/generateSchedule/timeSlots';
import { FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import type { ShiftCountBucket } from '@/lib/schedule/shiftRules';
import { normalizeShiftToken } from '@/lib/schedule/shiftRules';

export type AmPmContribution = { am: boolean; pm: boolean };

function segmentRangeMinutes(segment: ShiftSegment): { start: number; end: number } {
  const start = parseTimeToMinutes(segment.startTime);
  let end = parseTimeToMinutes(segment.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Reconstruct approximate segments from a persisted grid shift enum. */
export function shiftToSegmentsForCounting(
  shift: string,
  periods: OperatingPeriod[],
  maxDailyHours = 8
): ShiftSegment[] {
  const s = normalizeShiftToken(shift);
  if (s === 'NONE' || s === 'OFF' || !s) return [];
  if (s === 'MORNING') {
    if (!periods.length) return [];
    return [segmentFromPeriodStart(periods[0], 0, maxDailyHours)];
  }
  if (s === 'EVENING') {
    if (!periods.length) return [];
    const idx = periods.length >= 2 ? 1 : 0;
    return [segmentFromPeriodEnd(periods[idx], idx, maxDailyHours)];
  }
  // SPLIT without saved segments: no synthetic time blocks (avoids fixed 09:30–13:30 + 18:30–22:30 gap).
  if (s === 'SPLIT') return [];
  return [];
}

/** Whether a segment overlaps the AM or PM bucket for the day's operating periods. */
export function segmentsAmPmContribution(
  segments: ShiftSegment[],
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean
): AmPmContribution {
  if (!segments.length || !periods.length) return { am: false, pm: false };

  const fridayPmOnly = dayOfWeek === FRIDAY_DOW && !isRamadan && periods.length === 1;

  if (periods.length >= 2) {
    const indexes = new Set(segments.map((s) => s.periodIndex));
    return {
      am: indexes.has(0),
      pm: indexes.has(1),
    };
  }

  if (fridayPmOnly) {
    return { am: false, pm: segments.some((s) => s.periodIndex === 0) };
  }

  const period = periods[0];
  const { start: pStart, end: pEnd } = periodBounds(period);
  const periodMid = (pStart + pEnd) / 2;

  if (segments.length >= 2) {
    let am = false;
    let pm = false;
    for (const seg of segments) {
      const { start, end } = segmentRangeMinutes(seg);
      if (rangesOverlap(start, end, pStart, periodMid)) am = true;
      if (rangesOverlap(start, end, periodMid, pEnd)) pm = true;
    }
    return { am, pm };
  }

  const seg = segments[0];
  const { start, end } = segmentRangeMinutes(seg);
  const startsAtPeriodOpen = Math.abs(start - pStart) < 30;
  const endsAtPeriodClose = Math.abs(end - pEnd) < 30;

  if (startsAtPeriodOpen && !endsAtPeriodClose) return { am: true, pm: false };
  if (endsAtPeriodClose && !startsAtPeriodOpen) return { am: false, pm: true };
  if (startsAtPeriodOpen && endsAtPeriodClose) {
    return { am: start < periodMid, pm: end > periodMid };
  }

  let am = false;
  let pm = false;
  if (rangesOverlap(start, end, pStart, periodMid)) am = true;
  if (rangesOverlap(start, end, periodMid, pEnd)) pm = true;
  return { am, pm };
}

export function shiftAmPmContribution(
  shift: string,
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean,
  maxDailyHours = 8,
  explicitSegments?: ShiftSegment[]
): AmPmContribution {
  const s = normalizeShiftToken(shift);
  if (s === 'COVER_RASHID_AM' || s === 'COVER_RASHID_PM') return { am: false, pm: false };
  if (explicitSegments && explicitSegments.length > 0) {
    return segmentsAmPmContribution(explicitSegments, periods, dayOfWeek, isRamadan);
  }
  if (s === 'SPLIT') return { am: true, pm: true };
  const segments = shiftToSegmentsForCounting(shift, periods, maxDailyHours);
  return segmentsAmPmContribution(segments, periods, dayOfWeek, isRamadan);
}

export function incrementCountsFromShiftCoverage(
  counts: ShiftCountBucket,
  shift: string,
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean,
  maxDailyHours = 8,
  explicitSegments?: ShiftSegment[]
): void {
  const s = normalizeShiftToken(shift);
  if (s === 'COVER_RASHID_AM') {
    counts.rashidAmCount++;
    return;
  }
  if (s === 'COVER_RASHID_PM') {
    counts.rashidPmCount++;
    return;
  }
  const { am, pm } = shiftAmPmContribution(
    shift,
    periods,
    dayOfWeek,
    isRamadan,
    maxDailyHours,
    explicitSegments
  );
  if (am) counts.amCount++;
  if (pm) counts.pmCount++;
}

/** Map segments to grid enum without losing segment detail on the proposal/action. */
export function segmentsToGridShiftEnum(
  segments: ShiftSegment[],
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean
): 'MORNING' | 'EVENING' | 'SPLIT' | 'NONE' {
  if (!segments.length) return 'NONE';
  const { am, pm } = segmentsAmPmContribution(segments, periods, dayOfWeek, isRamadan);
  if (am && pm) return 'SPLIT';
  if (pm) return 'EVENING';
  if (am) return 'MORNING';
  return 'NONE';
}

export function contributesToMorningListFromCoverage(
  shift: string,
  isFridayDay: boolean,
  periods: OperatingPeriod[],
  isRamadan: boolean,
  segments?: ShiftSegment[]
): boolean {
  if (isFridayDay && !isRamadan) return false;
  return shiftAmPmContribution(shift, periods, isFridayDay ? FRIDAY_DOW : 0, isRamadan, 8, segments).am;
}

export function contributesToEveningListFromCoverage(
  shift: string,
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean,
  segments?: ShiftSegment[]
): boolean {
  return shiftAmPmContribution(shift, periods, dayOfWeek, isRamadan, 8, segments).pm;
}
