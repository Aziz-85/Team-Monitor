/**
 * Daily sales ledger: reconcile lines total vs summary total.
 * SAR integer only. Lock allowed only when diff === 0.
 */

import { prisma } from '@/lib/db';
import { SalesEntryStatus } from '@prisma/client';

export interface ReconcileResult {
  linesTotal: number;
  summaryTotal: number;
  diff: number;
  canLock: boolean;
  status: SalesEntryStatus;
}

/**
 * Sum of amountSar for all lines of a summary.
 */
export async function computeLinesTotal(summaryId: string): Promise<number> {
  const result = await prisma.boutiqueSalesLine.aggregate({
    where: { summaryId },
    _sum: { amountSar: true },
  });
  return result._sum?.amountSar ?? 0;
}

/**
 * Diff between summary total and lines total.
 * Positive = summary > lines, negative = lines > summary.
 */
export function computeDiff(summaryTotal: number, linesTotal: number): number {
  return summaryTotal - linesTotal;
}

/**
 * Full reconcile for a summary: lines total, diff, and whether lock is allowed.
 * Lock allowed only when status is DRAFT and linesTotal === summary.totalSar.
 */
export async function reconcileSummary(summaryId: string): Promise<ReconcileResult | null> {
  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { id: summaryId },
    select: { totalSar: true, status: true },
  });
  if (!summary) return null;
  const linesTotal = await computeLinesTotal(summaryId);
  const diff = computeDiff(summary.totalSar, linesTotal);
  const canLock =
    summary.status === 'DRAFT' && diff === 0;
  return {
    linesTotal,
    summaryTotal: summary.totalSar,
    diff,
    canLock,
    status: summary.status,
  };
}

/**
 * Validate that an amount is a non-negative integer (SAR, no decimals).
 */
export function validateSarInteger(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: false, error: 'Amount is required' };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, error: 'Amount must be a non-negative integer (SAR)' };
    }
    return { ok: true, value };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { ok: false, error: 'Amount is required' };
    const num = Number(trimmed);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      return { ok: false, error: 'Amount must be a non-negative integer (SAR)' };
    }
    return { ok: true, value: num };
  }
  return { ok: false, error: 'Amount must be a number' };
}
