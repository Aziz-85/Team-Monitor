/**
 * GET /api/performance/hub — Performance Hub payload (scoped sales vs reporting targets).
 * Query: bootstrap=1 → scope/capabilities only. Otherwise: entity, period, anchor, compare, boutiqueIds, regionIds, employeeUserId.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { HubPeriodKind } from '@/lib/performance/hubPeriods';
import { buildPerformanceHubPayload } from '@/lib/performance/hubEngine';
import {
  normalizeCompareMode,
  resolvePerformanceHubContext,
} from '@/lib/performance/hubScope';
import { toRiyadhDateString, getRiyadhNow } from '@/lib/time';

export const dynamic = 'force-dynamic';

const PERIODS: HubPeriodKind[] = ['day', 'week', 'month', 'quarter', 'half', 'year'];

function parseList(param: string | null): string[] {
  if (!param?.trim()) return [];
  return param.split(/[,]+/).map((s) => s.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const scoped = await resolvePerformanceHubContext(request);
  if (scoped.res) return scoped.res;
  const ctx = scoped.ctx!;

  const sp = request.nextUrl.searchParams;
  if (sp.get('bootstrap') === '1') {
    return NextResponse.json({
      userId: ctx.userId,
      role: ctx.role,
      allowedBoutiqueIds: ctx.allowedBoutiqueIds,
      boutiques: ctx.boutiques,
      regions: ctx.regions,
      canCompareBoutiques: ctx.canCompareBoutiques,
      canCompareRegions: ctx.canCompareRegions,
      defaultBoutiqueIds: ctx.defaultBoutiqueIds,
    });
  }

  const entity = sp.get('entity') === 'employees' ? 'employees' : 'boutique';
  const periodRaw = (sp.get('period') ?? 'month').toLowerCase();
  const period = (PERIODS.includes(periodRaw as HubPeriodKind) ? periodRaw : 'month') as HubPeriodKind;
  const anchor =
    sp.get('anchor')?.trim() ||
    toRiyadhDateString(getRiyadhNow());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    return NextResponse.json({ error: 'Invalid anchor (use YYYY-MM-DD)' }, { status: 400 });
  }

  const compareMode = normalizeCompareMode(sp.get('compare'), ctx);
  const requestedBoutiques = parseList(sp.get('boutiqueIds'));
  let boutiqueIds = requestedBoutiques.filter((id) => ctx.allowedBoutiqueIds.includes(id));
  if (requestedBoutiques.length > 0 && boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'Invalid boutique selection' }, { status: 403 });
  }
  if (boutiqueIds.length === 0) boutiqueIds = [...ctx.defaultBoutiqueIds];

  if (!ctx.canCompareBoutiques && boutiqueIds.length > 1) {
    boutiqueIds = boutiqueIds.slice(0, 1);
  }

  const regionIds = parseList(sp.get('regionIds')).filter((id) => ctx.regions.some((r) => r.id === id));
  if (compareMode === 'regions' && !ctx.canCompareRegions) {
    return NextResponse.json({ error: 'Region comparison not allowed' }, { status: 403 });
  }

  const employeeUserId = sp.get('employeeUserId')?.trim() || null;

  try {
    const payload = await buildPerformanceHubPayload({
      ctx,
      entity,
      period,
      anchorDateKey: anchor,
      compareMode,
      boutiqueIds,
      regionIds,
      employeeUserId,
    });
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[performance/hub]', e);
    return NextResponse.json({ error: 'Failed to build performance data' }, { status: 500 });
  }
}
