/**
 * Business calendar keys for Asia/Riyadh. Delegates to lib/time (single source of truth).
 */

import { getRiyadhNow, formatDateRiyadh, getCurrentMonthKeyRiyadh } from '@/lib/time';

export { getRiyadhNow };

/** Today as YYYY-MM-DD in Asia/Riyadh. */
export function getRiyadhDateKey(): string {
  return formatDateRiyadh(getRiyadhNow());
}

/** Current month as YYYY-MM in Asia/Riyadh. */
export function getRiyadhMonthKey(): string {
  return getCurrentMonthKeyRiyadh();
}
