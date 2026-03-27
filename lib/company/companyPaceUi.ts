import type { PaceBand } from '@/lib/analytics/performanceLayer';

export type PaceLabelKey = 'analytics.ahead' | 'analytics.onTrack' | 'analytics.behind';

export function companyPaceLabelKey(band: PaceBand | string): PaceLabelKey {
  if (band === 'ahead') return 'analytics.ahead';
  if (band === 'behind') return 'analytics.behind';
  return 'analytics.onTrack';
}

/** Sort key for client-side ordering: ahead → on_track → behind */
export function paceBandSortOrder(band: PaceBand | string): number {
  if (band === 'ahead') return 0;
  if (band === 'onTrack') return 1;
  return 2;
}
