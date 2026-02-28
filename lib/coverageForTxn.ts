/**
 * Guest coverage attribution for sales ledger.
 * Given a transaction at host boutique by an employee on a date, determines if
 * that employee was covering as guest (ShiftOverride) and returns source boutique + shift (AM/PM).
 * All dates normalized to Asia/Riyadh.
 */

import { prisma } from '@/lib/db';
import { normalizeDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import type { OverrideShift } from '@prisma/client';

export type CoverageForTxnInput = {
  boutiqueId: string;
  employeeId: string;
  txnDate: Date;
};

export type CoverageForTxnResult = {
  isGuestCoverage: boolean;
  sourceBoutiqueId: string | null;
  shift: string | null; // 'AM' | 'PM'
};

const RIYADH_AM_SHIFTS: OverrideShift[] = ['MORNING', 'COVER_RASHID_AM'];
const RIYADH_PM_SHIFTS: OverrideShift[] = ['EVENING', 'COVER_RASHID_PM'];

function overrideShiftToAmPm(overrideShift: OverrideShift): string | null {
  if (RIYADH_AM_SHIFTS.includes(overrideShift)) return 'AM';
  if (RIYADH_PM_SHIFTS.includes(overrideShift)) return 'PM';
  return null; // NONE or unknown
}

/**
 * Resolve guest coverage for a ledger transaction.
 * Uses ShiftOverride: host boutique = boutiqueId, empId = employeeId, date = txnDate (Riyadh).
 */
export async function coverageForTxn(
  input: CoverageForTxnInput
): Promise<CoverageForTxnResult> {
  const dateOnly = normalizeDateRiyadh(input.txnDate);

  const override = await prisma.shiftOverride.findFirst({
    where: {
      boutiqueId: input.boutiqueId,
      empId: input.employeeId,
      date: dateOnly,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!override) {
    return { isGuestCoverage: false, sourceBoutiqueId: null, shift: null };
  }

  const shift = overrideShiftToAmPm(override.overrideShift);
  const sourceBoutiqueId = override.sourceBoutiqueId ?? null;
  // Any override at host boutique for this employee on this date = guest coverage
  const isGuestCoverage = true;

  return {
    isGuestCoverage,
    sourceBoutiqueId,
    shift,
  };
}
