/**
 * Persist and load ShiftOverride time segments.
 */

import { prisma } from '@/lib/db';
import type { ShiftSegment } from '@/lib/schedule/generateSchedule/types';

export type StoredShiftSegment = ShiftSegment;

export async function replaceOverrideSegments(
  shiftOverrideId: string,
  segments: StoredShiftSegment[] | null | undefined
): Promise<void> {
  await prisma.shiftOverrideSegment.deleteMany({ where: { shiftOverrideId } });
  if (!segments?.length) return;
  await prisma.shiftOverrideSegment.createMany({
    data: segments.map((s, sortOrder) => ({
      shiftOverrideId,
      periodIndex: s.periodIndex,
      startTime: s.startTime,
      endTime: s.endTime,
      sortOrder,
    })),
  });
}

export async function loadSegmentsByOverrideIds(
  overrideIds: string[]
): Promise<Map<string, StoredShiftSegment[]>> {
  const map = new Map<string, StoredShiftSegment[]>();
  if (!overrideIds.length) return map;

  const rows = await prisma.shiftOverrideSegment.findMany({
    where: { shiftOverrideId: { in: overrideIds } },
    orderBy: [{ shiftOverrideId: 'asc' }, { sortOrder: 'asc' }],
  });

  for (const row of rows) {
    const list = map.get(row.shiftOverrideId) ?? [];
    list.push({
      periodIndex: row.periodIndex,
      startTime: row.startTime,
      endTime: row.endTime,
    });
    map.set(row.shiftOverrideId, list);
  }
  return map;
}
