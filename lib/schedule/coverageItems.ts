/**
 * Structured external coverage data for schedule view tables.
 * Presentation lives in CoverageCell; this module only shapes guest records.
 */

import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import { normShift } from '@/lib/shiftNorm';

export type CoverageShift = 'AM' | 'PM' | 'SPLIT';

export type CoverageItem = {
  employeeId?: string;
  fullName: string;
  shift: CoverageShift;
  sourceBoutique?: string;
  destinationBoutique?: string;
  /** Stable React key */
  id?: string;
};

export type GuestForCoverage = {
  id: string;
  date: string;
  empId: string;
  shift: string;
  sourceBoutique?: { name: string } | null;
  employee: { name: string; nameAr?: string | null; homeBoutiqueName?: string };
  pending?: boolean;
};

export function normalizeGuestCoverageShift(shift: string): CoverageShift | null {
  const v = String(shift ?? '').trim().toUpperCase();
  if (v === 'SPLIT') return 'SPLIT';
  const norm = normShift(shift);
  if (norm === 'AM') return 'AM';
  if (norm === 'PM') return 'PM';
  return null;
}

export function guestToCoverageItem(
  guest: GuestForCoverage,
  options: {
    destinationBoutique?: string;
    locale?: string;
    pendingLabel?: string;
  } = {}
): CoverageItem | null {
  const shift = normalizeGuestCoverageShift(guest.shift);
  if (!shift) return null;

  let fullName = getEmployeeDisplayName(guest.employee, options.locale ?? 'en') || guest.empId;
  if (guest.pending && options.pendingLabel) {
    fullName = `${fullName} (${options.pendingLabel})`;
  }

  return {
    id: guest.id,
    employeeId: guest.empId,
    fullName,
    shift,
    sourceBoutique: guest.sourceBoutique?.name ?? guest.employee.homeBoutiqueName,
    destinationBoutique: options.destinationBoutique,
  };
}

export function buildCoverageByDay(
  guests: GuestForCoverage[],
  options: {
    destinationBoutique?: string;
    locale?: string;
    pendingLabel?: string;
  } = {}
): Record<string, CoverageItem[]> {
  const map: Record<string, CoverageItem[]> = {};
  for (const guest of guests) {
    const item = guestToCoverageItem(guest, options);
    if (!item) continue;
    const list = map[guest.date] ?? [];
    list.push(item);
    map[guest.date] = list;
  }
  return map;
}

export function hasCoverageItems(coverageByDay: Record<string, CoverageItem[]>): boolean {
  return Object.values(coverageByDay).some((items) => items.length > 0);
}

export type CoverageTooltipLabels = {
  morningShift: string;
  afternoonShift: string;
  splitShift: string;
  from: string;
  covering: string;
};

export const DEFAULT_COVERAGE_TOOLTIP_LABELS: CoverageTooltipLabels = {
  morningShift: 'Morning Shift',
  afternoonShift: 'Afternoon Shift',
  splitShift: 'Split Shift',
  from: 'From',
  covering: 'Covering',
};

function shiftTooltipLine(shift: CoverageShift, labels: CoverageTooltipLabels): string {
  if (shift === 'AM') return labels.morningShift;
  if (shift === 'PM') return labels.afternoonShift;
  return labels.splitShift;
}

export function buildCoverageItemTooltip(
  item: CoverageItem,
  labels: CoverageTooltipLabels = DEFAULT_COVERAGE_TOOLTIP_LABELS
): string {
  const lines = [item.fullName, shiftTooltipLine(item.shift, labels)];
  if (item.sourceBoutique) lines.push(`${labels.from}: ${item.sourceBoutique}`);
  if (item.destinationBoutique) lines.push(`${labels.covering}: ${item.destinationBoutique}`);
  return lines.join('\n');
}
