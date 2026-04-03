import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { rosterForDate } from '@/lib/services/roster';
import { prisma } from '@/lib/db';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { getCoverageSuggestion } from '@/lib/services/coverageSuggestion';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import type { Role } from '@prisma/client';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const scope = await getOperationalScope(request);
    assertOperationalBoutiqueId(scope?.boutiqueId);
    if (!scope?.boutiqueId) {
      return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
    }
    const scopeOptions = { boutiqueIds: scope.boutiqueIds };

    const dateParam = request.nextUrl.searchParams.get('date') ?? getRiyadhDateKey();
    const date = new Date(dateParam + 'T00:00:00Z');

    const taskBoutiqueWhere =
      scope.boutiqueIds.length > 1
        ? { boutiqueId: { in: scope.boutiqueIds } }
        : scope.boutiqueId
          ? { boutiqueId: scope.boutiqueId }
          : {};

    const taskInclude = {
      taskSchedules: true,
      taskPlans: {
        include: {
          primary: { select: { empId: true, name: true } },
          backup1: { select: { empId: true, name: true } },
          backup2: { select: { empId: true, name: true } },
        },
      },
    } as const;

    const [roster, coverageValidation, suggestionResult, tasks] = await Promise.all([
      rosterForDate(date, scopeOptions),
      validateCoverage(date, scopeOptions),
      getCoverageSuggestion(date, scopeOptions),
      prisma.task.findMany({
        where: { active: true, ...taskBoutiqueWhere },
        include: taskInclude,
      }),
    ]);

    const runnable = tasks.filter((task) => tasksRunnableOnDate(task, date));
    const assignments = await Promise.all(runnable.map((task) => assignTaskOnDate(task, date)));
    const todayTasks = runnable.map((task, i) => {
      const a = assignments[i]!;
      return {
        taskId: task.id,
        taskName: task.name,
        assignedTo: a.assignedName ?? a.assignedEmpId,
        reason: a.reason,
        reasonNotes: a.reasonNotes,
      };
    });

    return NextResponse.json({
      date: dateParam,
      roster,
      coverageValidation,
      coverageSuggestion: suggestionResult.suggestion,
      coverageSuggestionExplanation: suggestionResult.explanation,
      todayTasks,
    });
  } catch (err) {
    console.error('/api/home error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
