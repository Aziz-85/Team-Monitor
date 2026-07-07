import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import { loadProposalEngineContext } from '@/lib/schedule/proposalGenerator';
import type { Role } from '@prisma/client';

export const maxDuration = 120;

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(EDIT_ROLES);
    if (!user || !canEditSchedule(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scheduleScope = await getScheduleScope(request);
    if (!scheduleScope?.boutiqueIds.length) {
      return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
    }

    let body: {
      weekStart?: string;
      boutiqueId?: string;
      externalCoverage?: Array<{
        empId: string;
        employeeName: string;
        date: string;
        shift: string;
        sourceBoutiqueId?: string;
      }>;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
    }

    const boutiqueIds = scheduleScope.boutiqueIds;
    if (body.boutiqueId && !boutiqueIds.includes(body.boutiqueId)) {
      return NextResponse.json({ error: 'boutiqueId out of scope' }, { status: 403 });
    }

    const targetBoutiqueIds = body.boutiqueId ? [body.boutiqueId] : boutiqueIds;

    const ctx = await loadProposalEngineContext({
      weekStart,
      boutiqueIds: targetBoutiqueIds,
      externalCoverage: body.externalCoverage,
    });

    return NextResponse.json({
      weekStart,
      weeklyStrategy: ctx.weeklyStrategy,
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : 'Strategy analysis failed';
    console.error('[schedule/v3/strategy]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
