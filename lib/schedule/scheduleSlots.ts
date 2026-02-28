/**
 * Schedule grid slot column logic: auto-expand from 4 to up to 6 columns
 * based on max employees per cell, no horizontal scroll.
 */

const BASE_SLOTS = 4;
const MAX_SLOTS = 6;

export type WeekSlotData = {
  morningByDay: string[][];
  eveningByDay: string[][];
};

/**
 * Returns visible slot count (4–6) and the raw max per cell.
 * visibleSlots = clamp(maxPerCell, BASE_SLOTS, MAX_SLOTS).
 */
export function getVisibleSlotCount(weekData: WeekSlotData): {
  visibleSlots: number;
  maxPerCell: number;
} {
  const { morningByDay, eveningByDay } = weekData;
  let maxPerCell = 0;
  for (let i = 0; i < (morningByDay?.length ?? 0); i++) {
    const m = (morningByDay[i] ?? []).length;
    const e = (eveningByDay[i] ?? []).length;
    if (m > maxPerCell) maxPerCell = m;
    if (e > maxPerCell) maxPerCell = e;
  }
  const visibleSlots = Math.min(
    MAX_SLOTS,
    Math.max(BASE_SLOTS, maxPerCell)
  );
  return { visibleSlots, maxPerCell };
}

/**
 * Returns extra Tailwind classes for slot cells when visibleSlots is 5 or 6
 * so the grid fits without horizontal scroll (narrower padding).
 * For 4 slots returns '' so layout is unchanged.
 */
export function getSlotColumnClass(visibleSlots: number): string {
  if (visibleSlots <= BASE_SLOTS) return '';
  return 'min-w-0 px-1.5';
}
