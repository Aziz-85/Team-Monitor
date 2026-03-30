import type { PlannerTaskEventStatus, PlannerTaskFrequency } from '@prisma/client';
import { toRiyadhDayKey } from '@/lib/time';
import { parsePlannerTaskMetadata } from '@/lib/integrations/planner/parsePlannerTaskMetadata';

export type PlannerTaskUpdatePayload = {
  plannerTaskId?: string;
  plannerTaskTitle?: string;
  bucketName?: string;
  notes?: string;
  completedByName?: string;
  completedByEmail?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  status?: string;
  eventAt?: string;
};

export type NormalizedPlannerEvent = {
  plannerTaskId: string | null;
  plannerTaskTitle: string | null;
  bucketName: string | null;
  notes: string | null;
  completedByName: string | null;
  completedByEmail: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  status: PlannerTaskEventStatus;
  eventAt: Date;
  completedOnDateKey: string;
  internalTaskKey: string | null;
  taskType: PlannerTaskFrequency | null;
  branchCode: string | null;
  parseOk: boolean;
};

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function normalizeEmail(v: unknown): string | null {
  const t = cleanText(v);
  return t ? t.toLowerCase() : null;
}

function normalizeStatus(v: unknown): PlannerTaskEventStatus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (['completed', 'done', 'complete', '100', 'closed'].includes(s)) return 'COMPLETED';
  if (['reopened', 'uncompleted', 'reopen', 'open'].includes(s)) return 'REOPENED';
  if (['updated', 'update', 'changed', 'in_progress', 'progress'].includes(s)) return 'UPDATED';
  return 'UNKNOWN';
}

export function normalizePlannerEvent(payload: PlannerTaskUpdatePayload): NormalizedPlannerEvent {
  const notes = cleanText(payload.notes);
  const parsed = parsePlannerTaskMetadata(notes);
  const eventAtRaw = cleanText(payload.eventAt);
  const eventAt = eventAtRaw ? new Date(eventAtRaw) : new Date();
  const safeEventAt = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;

  return {
    plannerTaskId: cleanText(payload.plannerTaskId),
    plannerTaskTitle: cleanText(payload.plannerTaskTitle),
    bucketName: cleanText(payload.bucketName),
    notes,
    completedByName: cleanText(payload.completedByName),
    completedByEmail: normalizeEmail(payload.completedByEmail),
    assignedToName: cleanText(payload.assignedToName),
    assignedToEmail: normalizeEmail(payload.assignedToEmail),
    status: normalizeStatus(payload.status),
    eventAt: safeEventAt,
    completedOnDateKey: toRiyadhDayKey(safeEventAt),
    internalTaskKey: parsed.internalTaskKey,
    taskType: parsed.taskType,
    branchCode: parsed.branchCode,
    parseOk: Boolean(parsed.internalTaskKey && parsed.taskType),
  };
}

