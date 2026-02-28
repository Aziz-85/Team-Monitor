/**
 * Unit tests for Approve Week taskKey backfill (ensureTaskKeys).
 * Scope must match export/sync; idempotent; validation fails if any nulls remain.
 */

import type { PrismaClient } from '@prisma/client';
import {
  getTasksInScopeForWeek,
  ensureTaskKeysForApprovedWeekWithTx,
} from '@/lib/sync/ensureTaskKeys';

const WEEK_SAT = '2026-02-07';

function mockTask(overrides: { id: string; name?: string; taskKey?: string | null }) {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Task',
    active: true,
    taskKey: overrides.taskKey ?? null,
    completionSource: null,
    importedCompletionAt: null,
    taskSchedules: [{ type: 'WEEKLY', weeklyDays: [6], monthlyDay: null, isLastDay: false }],
    taskPlans: [],
  };
}

describe('ensureTaskKeys (Approve Week backfill)', () => {
  it('backfills taskKey for tasks in scope with null key', async () => {
    const task1 = mockTask({ id: 't1', name: 'Zone A', taskKey: null });
    const updates: Array<{ id: string; taskKey: string }> = [];
    const mockTx = {
      task: {
        findMany: jest.fn().mockResolvedValue([task1]),
        update: jest.fn().mockImplementation((args: { where: { id: string }; data: { taskKey: string } }) => {
          updates.push({ id: args.where.id, taskKey: args.data.taskKey });
          return Promise.resolve({ ...task1, taskKey: args.data.taskKey });
        }),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as Pick<PrismaClient, 'task'>;

    const result = await ensureTaskKeysForApprovedWeekWithTx(mockTx, WEEK_SAT);

    expect(result).toEqual({ backfilled: 1, totalInScope: 1, remainingNull: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].taskKey).toMatch(/^DT-2026-Q1-W\d+-WKY-/);
  });

  it('does not overwrite existing taskKey (idempotent)', async () => {
    const task1 = mockTask({ id: 't1', taskKey: 'DT-2026-Q1-W6-WKY-NA-0001' });
    const mockTx = {
      task: {
        findMany: jest.fn().mockResolvedValue([task1]),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as Pick<PrismaClient, 'task'>;

    const result = await ensureTaskKeysForApprovedWeekWithTx(mockTx, WEEK_SAT);

    expect(result).toEqual({ backfilled: 0, totalInScope: 1, remainingNull: 0 });
    expect(mockTx.task.update).not.toHaveBeenCalled();
  });

  it('throws when validation finds remaining nulls', async () => {
    const task1 = mockTask({ id: 't1', taskKey: null });
    const mockTx = {
      task: {
        findMany: jest.fn().mockResolvedValue([task1]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Pick<PrismaClient, 'task'>;

    await expect(ensureTaskKeysForApprovedWeekWithTx(mockTx, WEEK_SAT)).rejects.toThrow(
      /taskKey=null/
    );
  });

  it('getTasksInScopeForWeek returns only tasks runnable in week', async () => {
    const inTask = mockTask({ id: 'in', name: 'Weekly Sat', taskKey: null });
    const outTask = mockTask({ id: 'out', name: 'No schedule', taskKey: null });
    (outTask as { taskSchedules: unknown[] }).taskSchedules = [];
    const mockTx = {
      task: {
        findMany: jest.fn().mockResolvedValue([inTask, outTask]),
      },
    } as unknown as Pick<PrismaClient, 'task'>;

    const inScope = await getTasksInScopeForWeek(mockTx, WEEK_SAT);

    expect(inScope.map((t) => t.id)).toEqual(['in']);
  });
});
