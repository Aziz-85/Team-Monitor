/**
 * Time slot construction and coverage validation.
 */

import type {
  DaySlotBundle,
  DayOperatingConfig,
  OperatingPeriod,
  ShiftSegment,
  SlotViolation,
  TimeSlot,
  WorkingDayShift,
} from './types';

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatMinutesAsTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function periodEndMinutes(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  return end;
}

/** Split operating periods into fixed-interval open time slots. Closed periods yield no slots. */
export function buildTimeSlots(
  operatingPeriods: OperatingPeriod[],
  date: string,
  intervalMinutes = 30
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  operatingPeriods.forEach((period, periodIndex) => {
    const start = parseTimeToMinutes(period.startTime);
    const end = periodEndMinutes(period.startTime, period.endTime);
    for (let t = start; t + intervalMinutes <= end; t += intervalMinutes) {
      const slotEnd = t + intervalMinutes;
      slots.push({
        id: `${date}-p${periodIndex}-${formatMinutesAsTime(t).replace(':', '')}`,
        date,
        periodIndex,
        startTime: formatMinutesAsTime(t),
        endTime: formatMinutesAsTime(slotEnd),
        minCoverage: period.minCoverage,
      });
    }
  });
  return slots;
}

export function buildDaySlotBundles(
  days: DayOperatingConfig[],
  intervalMinutes = 30
): DaySlotBundle[] {
  return days.map((day) => ({
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    operatingPeriods: day.operatingPeriods,
    slots: buildTimeSlots(day.operatingPeriods, day.date, intervalMinutes),
  }));
}

function slotRangeMinutes(slot: TimeSlot): { start: number; end: number } {
  const start = parseTimeToMinutes(slot.startTime);
  let end = parseTimeToMinutes(slot.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function segmentRangeMinutes(segment: ShiftSegment): { start: number; end: number } {
  const start = parseTimeToMinutes(segment.startTime);
  let end = parseTimeToMinutes(segment.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

export function segmentCoversSlot(segment: ShiftSegment, slot: TimeSlot): boolean {
  if (segment.periodIndex !== slot.periodIndex) return false;
  const sr = segmentRangeMinutes(segment);
  const tr = slotRangeMinutes(slot);
  return sr.start <= tr.start && sr.end >= tr.end;
}

export function calculateCoverageForSlot(dayShifts: WorkingDayShift[], slot: TimeSlot): number {
  const covered = new Set<string>();
  for (const shift of dayShifts) {
    if (shift.segments.some((seg) => segmentCoversSlot(seg, slot))) {
      covered.add(shift.empId);
    }
  }
  return covered.size;
}

export function validateCoverage(
  dayBundles: DaySlotBundle[],
  dayShiftsByDate: Map<string, WorkingDayShift[]>
): { valid: boolean; violations: SlotViolation[] } {
  const violations: SlotViolation[] = [];
  for (const bundle of dayBundles) {
    const shifts = dayShiftsByDate.get(bundle.date) ?? [];
    for (const slot of bundle.slots) {
      const coverage = calculateCoverageForSlot(shifts, slot);
      if (coverage < slot.minCoverage) {
        violations.push({
          date: slot.date,
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          coverage,
          minCoverage: slot.minCoverage,
        });
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

export function segmentDurationHours(segment: ShiftSegment): number {
  const { start, end } = segmentRangeMinutes(segment);
  return (end - start) / 60;
}

export function dayTotalHours(segments: ShiftSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentDurationHours(s), 0);
}

export function mergeAdjacentSegments(segments: ShiftSegment[]): ShiftSegment[] {
  if (!segments.length) return [];
  const sorted = [...segments].sort(
    (a, b) =>
      a.periodIndex - b.periodIndex ||
      parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );
  const merged: ShiftSegment[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.periodIndex === prev.periodIndex && cur.startTime === prev.endTime) {
      prev.endTime = cur.endTime;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

export function periodBounds(period: OperatingPeriod): { start: number; end: number } {
  return {
    start: parseTimeToMinutes(period.startTime),
    end: periodEndMinutes(period.startTime, period.endTime),
  };
}

/** Build a contiguous segment from period start up to maxHours (capped by period end). */
export function segmentFromPeriodStart(
  period: OperatingPeriod,
  periodIndex: number,
  maxHours: number
): ShiftSegment {
  const { start, end } = periodBounds(period);
  const cap = start + maxHours * 60;
  const segEnd = Math.min(end, cap);
  return {
    periodIndex,
    startTime: formatMinutesAsTime(start),
    endTime: formatMinutesAsTime(segEnd),
  };
}

/** Build a contiguous segment ending at period end, up to maxHours. */
export function segmentFromPeriodEnd(
  period: OperatingPeriod,
  periodIndex: number,
  maxHours: number
): ShiftSegment {
  const { start, end } = periodBounds(period);
  const cap = end - maxHours * 60;
  const segStart = Math.max(start, cap);
  return {
    periodIndex,
    startTime: formatMinutesAsTime(segStart),
    endTime: formatMinutesAsTime(end),
  };
}

/** Extend or add segment to cover a slot (same period, respects max daily hours). */
export function extendShiftToCoverSlot(
  segments: ShiftSegment[],
  slot: TimeSlot,
  period: OperatingPeriod,
  maxDailyHours: number
): ShiftSegment[] | null {
  const slotStart = parseTimeToMinutes(slot.startTime);
  let slotEnd = parseTimeToMinutes(slot.endTime);
  if (slotEnd <= slotStart) slotEnd += 24 * 60;

  const existing = segments.find((s) => s.periodIndex === slot.periodIndex);
  if (existing) {
    const { start, end } = segmentRangeMinutes(existing);
    const newStart = Math.min(start, slotStart);
    const newEnd = Math.max(end, slotEnd);
    if ((newEnd - newStart) / 60 > maxDailyHours) return null;
    const updated = segments.filter((s) => s.periodIndex !== slot.periodIndex);
    updated.push({
      periodIndex: slot.periodIndex,
      startTime: formatMinutesAsTime(newStart),
      endTime: formatMinutesAsTime(newEnd),
    });
    return mergeAdjacentSegments(updated);
  }

  const { start: pStart, end: pEnd } = periodBounds(period);
  const segStart = Math.max(pStart, slotStart);
  const segEnd = Math.min(pEnd, segStart + maxDailyHours * 60);
  if (segEnd <= segStart) return null;
  if (segEnd < slotEnd) return null;
  return mergeAdjacentSegments([
    ...segments,
    {
      periodIndex: slot.periodIndex,
      startTime: formatMinutesAsTime(segStart),
      endTime: formatMinutesAsTime(segEnd),
    },
  ]);
}
