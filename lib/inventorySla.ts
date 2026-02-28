/**
 * Inventory SLA: compute effective status (LATE) from cutoff time.
 * Default cutoff 15:00 Asia/Riyadh = 12:00 UTC.
 * LATE is not persisted; computed at runtime when status !== COMPLETED and now > cutoff.
 */

/** Get SLA cutoff time in ms (UTC). dateStr = YYYY-MM-DD, hourRiyadh = 15 => 15:00 Riyadh = 12:00 UTC on that date */
export function getSLACutoffMs(dateStr: string, hourRiyadh: number = 15): number {
  const utcHour = hourRiyadh - 3;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.getTime();
}

export function computeInventoryStatus(params: {
  baseStatus: string;
  completedAt?: Date | null;
  cutoffTimeMs: number;
  now?: number;
}): 'COMPLETED' | 'PENDING' | 'LATE' | 'UNASSIGNED' {
  const { baseStatus, completedAt, cutoffTimeMs, now = Date.now() } = params;
  if (baseStatus === 'COMPLETED' || completedAt != null) return 'COMPLETED';
  if (now > cutoffTimeMs) return 'LATE';
  return baseStatus as 'PENDING' | 'UNASSIGNED';
}
