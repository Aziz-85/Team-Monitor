import {
  MAX_ABS_DELTA_BATCH_SAR,
  MAX_CELL_SAR,
  HIGH_RISK_ABS_DELTA_SAR,
  HIGH_RISK_NEW_CELL_SAR,
  REASON_HIGH_RISK_MIN_LEN,
} from '@/lib/matrixSecureEdit/constants';

export type ChangedCellInput = {
  dateKey: string;
  userId: string;
  oldAmount: number;
  newAmount: number;
};

export type CellValidationError =
  | { code: 'INVALID_ENTRY'; message: string }
  | { code: 'DUPLICATE_CELL'; message: string }
  | { code: 'DELTA_MISMATCH'; message: string }
  | { code: 'GRAND_TOTAL_MISMATCH'; message: string }
  | { code: 'BATCH_LIMIT'; message: string }
  | { code: 'NO_CHANGES'; message: string };

function sortDateKey(a: string, b: string): number {
  return a.localeCompare(b, 'en');
}

/** Detect duplicate (dateKey, userId) in payload. */
export function findDuplicateCellKeys(cells: ChangedCellInput[]): string | null {
  const seen = new Set<string>();
  for (const c of cells) {
    const k = `${c.dateKey}\t${c.userId}`;
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
}

export function sumCellDeltas(cells: ChangedCellInput[]): number {
  let s = 0;
  for (const c of cells) s += c.newAmount - c.oldAmount;
  return s;
}

/** Server-side integrity: Σ(new − old) must match optional client claim (tamper check). */
export function validateClientDeltaClaim(
  cells: ChangedCellInput[],
  clientTotalDelta: unknown
): { ok: true } | { ok: false; error: CellValidationError } {
  if (clientTotalDelta === undefined || clientTotalDelta === null) return { ok: true };
  const n = Number(clientTotalDelta);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return {
      ok: false,
      error: { code: 'DELTA_MISMATCH', message: 'clientTotalDelta must be an integer when provided' },
    };
  }
  const actual = sumCellDeltas(cells);
  if (n !== actual) {
    return {
      ok: false,
      error: {
        code: 'DELTA_MISMATCH',
        message: `Cell delta sum (${actual}) does not match clientTotalDelta (${n})`,
      },
    };
  }
  return { ok: true };
}

/** After DB grand total known: expectedGrandAfter = grandBefore + sumDeltas; optional client claim. */
export function validateGrandTotalAfterClaim(
  grandBefore: number,
  cells: ChangedCellInput[],
  clientExpectedGrandAfter: unknown
): { ok: true; expectedGrandAfter: number } | { ok: false; error: CellValidationError } {
  const delta = sumCellDeltas(cells);
  const expectedGrandAfter = grandBefore + delta;
  if (expectedGrandAfter < 0) {
    return {
      ok: false,
      error: {
        code: 'GRAND_TOTAL_MISMATCH',
        message: 'Computed month total would be negative',
      },
    };
  }
  if (clientExpectedGrandAfter === undefined || clientExpectedGrandAfter === null) {
    return { ok: true, expectedGrandAfter };
  }
  const n = Number(clientExpectedGrandAfter);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return {
      ok: false,
      error: {
        code: 'GRAND_TOTAL_MISMATCH',
        message: 'clientExpectedGrandTotalAfter must be an integer when provided',
      },
    };
  }
  if (n !== expectedGrandAfter) {
    return {
      ok: false,
      error: {
        code: 'GRAND_TOTAL_MISMATCH',
        message: `Expected month total after save (${expectedGrandAfter}) does not match client claim (${n})`,
      },
    };
  }
  return { ok: true, expectedGrandAfter };
}

export type SuspiciousAnalysis = {
  warnings: string[];
  /** User must send confirmForceSave: true to proceed. */
  requiresConfirmForceSave: boolean;
};

const SPIKE_RATIO = 3;
const SPIKE_MIN_NEW = 25_000;

export function analyzeSuspiciousPatterns(cells: ChangedCellInput[]): SuspiciousAnalysis {
  const warnings: string[] = [];
  let requiresConfirmForceSave = false;

  const byUser = new Map<string, ChangedCellInput[]>();
  for (const c of cells) {
    const list = byUser.get(c.userId) ?? [];
    list.push(c);
    byUser.set(c.userId, list);
  }

  for (const [userId, list] of Array.from(byUser.entries())) {
    const byAmount = new Map<number, number>();
    for (const c of list) {
      if (c.oldAmount === c.newAmount) continue;
      byAmount.set(c.newAmount, (byAmount.get(c.newAmount) ?? 0) + 1);
    }
    for (const [amt, count] of Array.from(byAmount.entries())) {
      if (count >= 3 && amt > 0) {
        warnings.push(
          `User ${userId.slice(0, 8)}… has the same new amount (${amt}) on ${count} days — verify not a copy/paste error.`
        );
        requiresConfirmForceSave = true;
      }
    }

    const sorted = [...list].sort((a, b) => sortDateKey(a.dateKey, b.dateKey));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (prev.userId !== cur.userId) continue;
      const d0 = prev.dateKey;
      const d1 = cur.dateKey;
      if (d0.slice(0, 7) !== d1.slice(0, 7)) continue;
      const day0 = Number(d0.slice(8, 10));
      const day1 = Number(d1.slice(8, 10));
      if (Number.isFinite(day0) && Number.isFinite(day1) && day1 === day0 + 1) {
        if (prev.newAmount === cur.newAmount && prev.newAmount > 0 && prev.newAmount !== prev.oldAmount) {
          warnings.push(
            `Consecutive days ${d0} / ${d1} share the same new sale (${prev.newAmount}) for one employee — check for shifted entry.`
          );
          requiresConfirmForceSave = true;
        }
      }
    }

    const absVals = list.map((c) => Math.abs(c.newAmount - c.oldAmount));
    const medianAbs =
      absVals.length === 0
        ? 0
        : [...absVals].sort((a, b) => a - b)[Math.floor(absVals.length / 2)] ?? 0;

    for (const c of list) {
      if (c.newAmount <= c.oldAmount) continue;
      const jump = c.newAmount - c.oldAmount;
      if (
        c.newAmount >= SPIKE_MIN_NEW &&
        c.newAmount >= SPIKE_RATIO * Math.max(c.oldAmount, medianAbs, 1)
      ) {
        warnings.push(
          `Large spike on ${c.dateKey}: ${c.oldAmount} → ${c.newAmount} (Δ +${jump}) — confirm intentional.`
        );
        requiresConfirmForceSave = true;
      }
    }

  }

  return { warnings, requiresConfirmForceSave };
}

export type HighRiskAssessment = {
  /** Block save until user sets confirmForceSave (pattern review). */
  needsConfirmForceSave: boolean;
  /** After confirm (or when batch/cell is large), require forceSave + long reason. */
  requiresForceSaveReason: boolean;
  /** Convenience: activity log flag when save proceeds under elevated risk. */
  logAsHighRisk: boolean;
};

export function assessHighRiskSave(input: {
  absDeltaSum: number;
  cells: ChangedCellInput[];
  suspicious: SuspiciousAnalysis;
  confirmForceSave: boolean;
}): HighRiskAssessment {
  const needsConfirmForceSave =
    input.suspicious.requiresConfirmForceSave && !input.confirmForceSave;

  const anyLargeNew = input.cells.some((c) => c.newAmount >= HIGH_RISK_NEW_CELL_SAR);
  const largeBatch = input.absDeltaSum > HIGH_RISK_ABS_DELTA_SAR;
  const suspiciousConfirmed =
    input.suspicious.requiresConfirmForceSave && input.confirmForceSave;

  const requiresForceSaveReason = largeBatch || anyLargeNew || suspiciousConfirmed;
  const logAsHighRisk = requiresForceSaveReason || input.suspicious.warnings.length > 0;

  return {
    needsConfirmForceSave,
    requiresForceSaveReason,
    logAsHighRisk,
  };
}

export function assertHighRiskGate(
  assessment: HighRiskAssessment,
  forceSave: boolean,
  reasonLen: number
): { ok: true } | { ok: false; code: string; message: string } {
  if (assessment.needsConfirmForceSave) {
    return {
      ok: false,
      code: 'NEED_CONFIRM_FORCE_SAVE',
      message: 'Suspicious pattern detected. Set confirmForceSave to true after review, then retry.',
    };
  }
  if (!assessment.requiresForceSaveReason) return { ok: true };
  if (!forceSave) {
    return {
      ok: false,
      code: 'HIGH_RISK_EDIT',
      message: 'High-risk edit: set forceSave to true to proceed.',
    };
  }
  if (reasonLen < REASON_HIGH_RISK_MIN_LEN) {
    return {
      ok: false,
      code: 'HIGH_RISK_EDIT',
      message: `High-risk edit: reason must be at least ${REASON_HIGH_RISK_MIN_LEN} characters.`,
    };
  }
  return { ok: true };
}

export function parseChangedCells(
  changedCellsRaw: unknown,
  allowedDays: Set<string>,
  allowedUserIds: Set<string>
): { ok: true; cells: ChangedCellInput[] } | { ok: false; error: CellValidationError } {
  if (!Array.isArray(changedCellsRaw) || changedCellsRaw.length === 0) {
    return { ok: false, error: { code: 'INVALID_ENTRY', message: 'changedCells must be a non-empty array' } };
  }

  const cells: ChangedCellInput[] = [];
  for (const raw of changedCellsRaw) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Invalid changedCells entry' } };
    }
    const o = raw as Record<string, unknown>;
    const dateKey = typeof o.dateKey === 'string' ? o.dateKey.trim() : '';
    const uid = typeof o.userId === 'string' ? o.userId.trim() : '';
    const oldAmount = Number(o.oldAmount);
    const newAmount = Number(o.newAmount);
    if (!dateKey || !allowedDays.has(dateKey)) {
      return { ok: false, error: { code: 'INVALID_ENTRY', message: `Invalid dateKey: ${dateKey}` } };
    }
    if (!uid || !allowedUserIds.has(uid)) {
      return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Invalid or out-of-scope userId' } };
    }
    if (!Number.isInteger(oldAmount) || oldAmount < 0 || !Number.isInteger(newAmount) || newAmount < 0) {
      return { ok: false, error: { code: 'INVALID_ENTRY', message: 'Amounts must be non-negative integers' } };
    }
    if (newAmount > MAX_CELL_SAR) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ENTRY',
          message: `Per-cell amount exceeds maximum (${MAX_CELL_SAR} SAR)`,
        },
      };
    }
    if (oldAmount === newAmount) continue;
    cells.push({ dateKey, userId: uid, oldAmount, newAmount });
  }

  if (cells.length === 0) {
    return { ok: false, error: { code: 'NO_CHANGES', message: 'No effective changes after validation' } };
  }

  const dup = findDuplicateCellKeys(cells);
  if (dup) {
    return {
      ok: false,
      error: { code: 'DUPLICATE_CELL', message: `Duplicate cell in request: ${dup}` },
    };
  }

  let absDeltaSum = 0;
  for (const c of cells) absDeltaSum += Math.abs(c.newAmount - c.oldAmount);
  if (absDeltaSum > MAX_ABS_DELTA_BATCH_SAR) {
    return {
      ok: false,
      error: {
        code: 'BATCH_LIMIT',
        message: `Total change magnitude exceeds safety limit (${MAX_ABS_DELTA_BATCH_SAR} SAR)`,
      },
    };
  }

  return { ok: true, cells };
}
