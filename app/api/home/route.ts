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

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
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

    const dateParam = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    const date = new Date(dateParam + 'T00:00:00Z');

    const [roster, coverageValidation, suggestionResult] = await Promise.all([
      rosterForDate(date, scopeOptions),
      validateCoverage(date, scopeOptions),
      getCoverageSuggestion(date, scopeOptions),
    ]);
    const tasks = await prisma.task.findMany({
      where: { active: true },
      include: {
        taskSchedules: true,
        taskPlans: {
          include: {
            primary: { select: { empId: true, name: true } },
            backup1: { select: { empId: true, name: true } },
            backup2: { select: { empId: true, name: true } },
          },
        },
      },
    });

    const todayTasks: Array<{
      taskId: string;
      taskName: string;
      assignedTo: string | null;
      reason: string;
      reasonNotes: string[];
    }> = [];

    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      todayTasks.push({
        taskId: task.id,
        taskName: task.name,
        assignedTo: a.assignedName ?? a.assignedEmpId,
        reason: a.reason,
        reasonNotes: a.reasonNotes,
      });
    }

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
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
