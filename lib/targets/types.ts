/** Unified target resolution types (Architecture Stabilization Phase 5). */

export type TargetStatus = 'assigned' | 'missing';

export type ResolvedBoutiqueTarget = {
  status: TargetStatus;
  /** Null when status is missing; includes explicit zero when assigned. */
  amountSar: number | null;
  hasMonthlyTarget: boolean;
  monthKey: string;
  boutiqueId: string;
};

export type ResolvedEmployeeTarget = {
  status: TargetStatus;
  amountSar: number | null;
  hasMonthlyTarget: boolean;
  monthKey: string;
  userId: string;
  boutiqueId: string | null;
  leaveDaysInMonth: number | null;
  presenceFactor: number | null;
  scheduledDaysInMonth: number | null;
};
