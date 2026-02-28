import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSiteStateForPeriod } from '@/lib/sync/siteState';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { parsePlannerFile, parsePlannerCsv, runCompare } from '@/lib/sync/comparePlanner';
import { flagBursts, flagSameDayBulk, mergeFlags } from '@/lib/sync/antiGaming';
import { applyPlannerCompletions } from '@/lib/sync/applyCompletions';
import type { PlannerImportRow } from '@/lib/sync/comparePlanner';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ADMIN'];

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let periodType: 'WEEK' | 'MONTH' = 'WEEK';
  let periodKey = '';
  let plannerRows: PlannerImportRow[];
  let plannerFileName: string | null = null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const periodTypeVal = formData.get('periodType');
    const periodKeyVal = formData.get('periodKey');
    const file = formData.get('plannerFile');
    periodType = periodTypeVal === 'MONTH' ? 'MONTH' : 'WEEK';
    periodKey = String(periodKeyVal ?? '').trim();
    if (!periodKey || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'periodKey and plannerFile required' }, { status: 400 });
    }
    plannerFileName = file.name;
    const buffer = await file.arrayBuffer();
    plannerRows = parsePlannerFile(buffer, file.name);
  } else {
    let body: { periodType?: string; periodKey?: string; plannerCsv?: string; plannerFileName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON body or multipart form with periodKey and plannerFile required' }, { status: 400 });
    }
    periodType = body.periodType === 'MONTH' ? 'MONTH' : 'WEEK';
    periodKey = String(body.periodKey ?? '').trim();
    const plannerCsv = String(body.plannerCsv ?? '').trim();
    plannerFileName = body.plannerFileName ? String(body.plannerFileName) : null;
    if (!periodKey || !plannerCsv) {
      return NextResponse.json({ error: 'periodKey and plannerCsv required' }, { status: 400 });
    }
    plannerRows = parsePlannerCsv(plannerCsv);
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  try {
    const siteState = await getSiteStateForPeriod(periodType, periodKey, scheduleScope.boutiqueId);
    const burstFlags = flagBursts(plannerRows);
    const sameDayFlags = flagSameDayBulk(plannerRows);
    const merged = mergeFlags(burstFlags, sameDayFlags);
    const rowFlags = new Map<number, Record<string, unknown>>();
    for (const [i, flags] of Array.from(merged)) {
      rowFlags.set(i, { flags });
    }
    const result = runCompare(siteState, plannerRows, rowFlags);
    const { applied, skipped } = await applyPlannerCompletions(
      result.plannerDoneApply,
      siteState
    );

    const totalsJson = {
      matched: result.matched.length,
      plannerDoneApply: result.plannerDoneApply.length,
      siteDoneOnly: result.siteDoneOnly.length,
      conflicts: result.conflicts.length,
      missingKey: result.missingKey.length,
      suspicious: result.suspicious.length,
      applied,
      skipped,
    };

    const batch = await prisma.plannerImportBatch.create({
      data: {
        periodType,
        periodKey,
        uploadedById: user.id,
        plannerFileName,
        totalsJson,
        suspiciousCount: result.suspicious.length,
      },
    });

    for (let i = 0; i < plannerRows.length; i++) {
      const p = plannerRows[i];
      const flags = merged.get(i) ?? null;
      await prisma.plannerImportRow.create({
        data: {
          batchId: batch.id,
          taskKey: p.taskKey,
          title: p.title,
          assignee: p.assignee,
          dueDate: p.dueDate ? new Date(p.dueDate) : null,
          status: p.status,
          completedAtRaw: p.completedAtRaw,
          flagsJson: flags ? { flags } : undefined,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      applied,
      skipped,
      totals: totalsJson,
      compare: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
