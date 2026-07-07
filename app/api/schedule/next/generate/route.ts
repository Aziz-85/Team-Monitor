import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canEditSchedule } from '@/lib/rbac/schedulePermissions';
import {
  buildScheduleNextInputFromGrid,
  buildScheduleNextProposal,
} from '@/lib/schedule-next';
import type { ExternalSupportDraft } from '@/lib/schedule-next/types';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import type { Role } from '@prisma/client';

const EDIT_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

type GenerateBody = {
  weekStart?: string;
  boutiqueId?: string;
  externalSupport?: ExternalSupportDraft[];
  rejectedProposalIds?: string[];
  seed?: number;
};

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(EDIT_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user || !canEditSchedule(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD)' }, { status: 400 });
  }

  const externalSupport = Array.isArray(body.externalSupport) ? body.externalSupport : [];
  const rejectedProposalIds = Array.isArray(body.rejectedProposalIds)
    ? body.rejectedProposalIds.filter((id): id is string => typeof id === 'string')
    : [];
  const seed = typeof body.seed === 'number' ? body.seed : undefined;

  try {
    const boutiqueIds = scheduleScope.boutiqueIds;
    const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
    const input = buildScheduleNextInputFromGrid(weekStart, grid, externalSupport);
    const proposal = buildScheduleNextProposal(
      input,
      { seed, rejectedProposalIds },
      grid.rows
    );

    return NextResponse.json(proposal);
  } catch (e) {
    console.error('[schedule/next/generate]', e);
    const message = e instanceof Error ? e.message : 'Failed to generate schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
