/**
 * Server-only leave approval rule engine.
 * evaluateLeaveApproval(req) -> { canManagerApprove, requiresAdmin, reasons }
 * Rules that set requiresAdmin=true: duration > 7, overlap approved/locked week, coverage threshold, backdated, editing approved, (optional) too many leaves in 60 days.
 */

import { prisma } from '@/lib/db';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { getWeekStatus } from '@/lib/services/scheduleLock';
import { isWeekLocked } from '@/lib/services/scheduleLock';

export type LeaveRequestForEvaluation = {
  id?: string;
  boutiqueId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  status?: string;
};

export type LeaveEvaluationResult = {
  canManagerApprove: boolean;
  requiresAdmin: boolean;
  reasons: string[];
};

const MAX_MANAGER_DAYS = 7;
const MAX_LEAVES_LAST_60_DAYS = 5; // optional rule

function toDateStr(d: Date): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function daysBetween(start: Date, end: Date): number {
  const a = new Date(toDateStr(start) + 'T12:00:00Z').getTime();
  const b = new Date(toDateStr(end) + 'T12:00:00Z').getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/** Get all Saturday week-start strings that overlap [startDate, endDate]. */
function getWeekStartsInRange(startDate: Date, endDate: Date): string[] {
  const weekStarts = new Set<string>();
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    weekStarts.add(getWeekStart(d));
  }
  return Array.from(weekStarts);
}

export async function evaluateLeaveApproval(
  req: LeaveRequestForEvaluation
): Promise<LeaveEvaluationResult> {
  const reasons: string[] = [];
  let requiresAdmin = false;

  const startDate = req.startDate instanceof Date ? req.startDate : new Date(req.startDate);
  const endDate = req.endDate instanceof Date ? req.endDate : new Date(req.endDate);
  const durationDays = daysBetween(startDate, endDate);

  // Rule: duration > 7 days
  if (durationDays > MAX_MANAGER_DAYS) {
    requiresAdmin = true;
    reasons.push(`Leave duration (${durationDays} days) exceeds ${MAX_MANAGER_DAYS} days; requires admin approval.`);
  }

  // Rule: backdated (startDate < today)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startOnly = new Date(toDateStr(startDate) + 'T00:00:00Z');
  if (startOnly.getTime() < today.getTime()) {
    requiresAdmin = true;
    reasons.push('Leave start date is in the past; requires admin approval.');
  }

  // Rule: overlaps approved or locked schedule week
  const weekStarts = getWeekStartsInRange(startDate, endDate);
  for (const weekStart of weekStarts) {
    const status = await getWeekStatus(weekStart, req.boutiqueId);
    if (status?.status === 'APPROVED') {
      requiresAdmin = true;
      reasons.push(`Leave overlaps an approved schedule week (${weekStart}); requires admin approval.`);
      break;
    }
    const locked = await isWeekLocked(weekStart, req.boutiqueId);
    if (locked) {
      requiresAdmin = true;
      reasons.push(`Leave overlaps a locked schedule week (${weekStart}); requires admin approval.`);
      break;
    }
  }

  // Rule: coverage would drop below minimum (CoverageRule exists for boutique → require admin to verify)
  const coverageRules = await prisma.coverageRule.findMany({
    where: { OR: [{ boutiqueId: req.boutiqueId }, { boutiqueId: null }], enabled: true },
  });
  if (coverageRules.length > 0) {
    requiresAdmin = true;
    reasons.push('Coverage rules exist for this boutique; staffing check requires admin approval.');
  }

  // Rule: editing an already approved leave
  if (req.id && req.status) {
    const approvedStatuses = ['APPROVED_MANAGER', 'APPROVED_ADMIN'];
    if (approvedStatuses.includes(req.status)) {
      requiresAdmin = true;
      reasons.push('Cannot change an already approved leave; requires admin.');
    }
  }

  // Optional: too many leaves for same user in last 60 days
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60);
  const countWhere: { userId: string; status: { in: string[] }; endDate: { gte: Date }; id?: { not: string } } = {
    userId: req.userId,
    status: { in: ['APPROVED_MANAGER', 'APPROVED_ADMIN', 'SUBMITTED'] },
    endDate: { gte: sixtyDaysAgo },
  };
  if (req.id) countWhere.id = { not: req.id };
  const count = await prisma.leaveRequest.count({ where: countWhere });
  if (count >= MAX_LEAVES_LAST_60_DAYS) {
    requiresAdmin = true;
    reasons.push(`User has ${count} leave(s) in the last 60 days; requires admin approval.`);
  }

  const canManagerApprove = !requiresAdmin;
  return { canManagerApprove, requiresAdmin, reasons };
}
