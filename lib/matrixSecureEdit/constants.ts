/** Page / audit source identifier (stable). */
export const MATRIX_SECURE_EDIT_PAGE = 'monthly-matrix-secure-edit';

/** Unlock TTL (ms). */
export const UNLOCK_TTL_MS = 15 * 60 * 1000;

/** Max SAR per cell (single-day employee sale). */
export const MAX_CELL_SAR = 150_000;

/** Max sum of |delta| per save batch (anti “fat finger”). */
export const MAX_ABS_DELTA_BATCH_SAR = 750_000;

export const REASON_MIN_LEN = 8;

/** High-risk save: reason must be at least this long when force-save is required. */
export const REASON_HIGH_RISK_MIN_LEN = 15;

/** Batch |Δ| above this requires forceSave + long reason (stricter than MAX_ABS_DELTA_BATCH_SAR). */
export const HIGH_RISK_ABS_DELTA_SAR = 400_000;

/** New cell value at or above this (SAR) triggers high-risk path. */
export const HIGH_RISK_NEW_CELL_SAR = 100_000;

export const UNLOCK_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_UNLOCK_FAILURES = 8;

/** Generic client message for failed matrix unlock (password / policy); do not distinguish causes. */
export const MATRIX_UNLOCK_GENERIC_ERROR =
  'Unlock failed. Check your password and try again.';

export const MATRIX_MANUAL_EDIT_SOURCE = 'MATRIX_MANUAL_EDIT' as const;
