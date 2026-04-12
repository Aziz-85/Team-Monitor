/** Page / audit source identifier (stable). */
export const MATRIX_SECURE_EDIT_PAGE = 'monthly-matrix-secure-edit';

/** Unlock TTL (ms). */
export const UNLOCK_TTL_MS = 15 * 60 * 1000;

/** Max SAR per cell (single-day employee sale). */
export const MAX_CELL_SAR = 150_000;

/** Max sum of |delta| per save batch (anti “fat finger”). */
export const MAX_ABS_DELTA_BATCH_SAR = 750_000;

export const REASON_MIN_LEN = 8;

export const UNLOCK_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_UNLOCK_FAILURES = 8;

export const MATRIX_MANUAL_EDIT_SOURCE = 'MATRIX_MANUAL_EDIT' as const;
