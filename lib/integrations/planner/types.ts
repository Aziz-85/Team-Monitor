/**
 * Microsoft Planner integration — shared types.
 * Local DB is source of truth; Planner is external integration layer.
 * Using local type definitions to avoid Prisma client export dependency.
 */

export type PlannerIntegrationMode = 'GRAPH_DIRECT' | 'POWER_AUTOMATE' | 'MANUAL';
export type PlannerSyncDirection = 'IMPORT_ONLY' | 'EXPORT_ONLY' | 'TWO_WAY';
export type PlannerTaskLinkSyncStatus = 'LINKED' | 'PENDING' | 'ERROR' | 'DISCONNECTED';
export type PlannerSyncLogDirection = 'INBOUND' | 'OUTBOUND' | 'RECONCILIATION';
export type PlannerSyncLogStatus = 'SUCCESS' | 'ERROR' | 'SKIPPED';

/**
 * Power Automate webhook inbound payload contract.
 *
 * REQUIRED:
 *   - taskId (string): External Planner task ID. Also accepted in payload.raw.taskId.
 *   - eventType (string, if present): Must be string. Recommended: task.created | task.updated | task.completed | task.uncompleted
 *
 * OPTIONAL (used for completion sync when isCompleted=true):
 *   - assignedUsers: Array<{ email?, displayName?, id? }> — first email used to resolve Employee via PlannerUserMap
 *   - isCompleted (boolean) or percentComplete (number, 100 = completed)
 *   - planId, bucketId, title, description, dueDateTime, sourceUpdatedAt
 *   - eventId: For idempotency hints (full payload hash is primary)
 *   - raw: Fallback object for nested fields (e.g. raw.taskId)
 *
 * FALLBACK BEHAVIOR:
 *   - Unmapped user: Skipped; no TaskCompletion created
 *   - Unmapped bucket: Not used for completion; bucket maps only affect future features
 *   - Missing optional fields: Normalized to null/empty; processing continues
 */
export type InboundPlannerPayload = {
  eventType: string;
  eventId?: string;
  mode?: 'GRAPH_DIRECT' | 'POWER_AUTOMATE' | 'MANUAL';
  integrationKey?: string;
  planId?: string;
  bucketId?: string;
  bucketName?: string;
  taskId?: string;
  title?: string;
  description?: string;
  percentComplete?: number;
  isCompleted?: boolean;
  dueDateTime?: string;
  assignedUsers?: Array<{ id?: string; email?: string; displayName?: string }>;
  sourceUpdatedAt?: string;
  raw?: Record<string, unknown>;
};

/** Normalized inbound task for local processing. */
export type NormalizedInboundTask = {
  externalTaskId: string;
  externalPlanId: string | null;
  externalBucketId: string | null;
  title: string;
  description: string | null;
  isCompleted: boolean;
  dueDate: string | null; // YYYY-MM-DD
  assignedEmails: string[];
  assignedDisplayNames: string[];
  sourceUpdatedAt: string | null;
};
