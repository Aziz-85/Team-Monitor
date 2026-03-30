import type { PlannerTaskFrequency } from '@prisma/client';

export type ParsedPlannerTaskMetadata = {
  internalTaskKey: string | null;
  taskType: PlannerTaskFrequency | null;
  branchCode: string | null;
  rawMap: Record<string, string>;
};

function normalizeLineKey(k: string): string {
  return k.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeTaskType(v: string): PlannerTaskFrequency | null {
  const n = v.trim().toUpperCase();
  if (n === 'DAILY' || n === 'DAY' || n === 'D') return 'DAILY';
  if (n === 'WEEKLY' || n === 'WEEK' || n === 'W') return 'WEEKLY';
  if (n === 'MONTHLY' || n === 'MONTH' || n === 'M') return 'MONTHLY';
  return null;
}

/**
 * Parses Planner notes metadata lines:
 * KEY: DLY_SALES_TARGET
 * TYPE: DAILY
 * BRANCH: RASHID
 */
export function parsePlannerTaskMetadata(notes: string | null | undefined): ParsedPlannerTaskMetadata {
  if (!notes || typeof notes !== 'string') {
    return { internalTaskKey: null, taskType: null, branchCode: null, rawMap: {} };
  }

  const rawMap: Record<string, string> = {};
  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const k = normalizeLineKey(line.slice(0, colonIdx));
    const v = line.slice(colonIdx + 1).trim();
    if (!v) continue;
    rawMap[k] = v;
  }

  const key = (rawMap.KEY ?? '').trim();
  const internalTaskKey = key ? key.toUpperCase().replace(/\s+/g, '_') : null;
  const taskType = normalizeTaskType(rawMap.TYPE ?? '');
  const branchRaw = (rawMap.BRANCH ?? '').trim();
  const branchCode = branchRaw ? branchRaw.toUpperCase().replace(/\s+/g, '_') : null;

  return { internalTaskKey, taskType, branchCode, rawMap };
}

