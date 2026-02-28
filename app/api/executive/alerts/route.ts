/**
 * Executive Alerts API — severity + evidence + deep links. ADMIN + MANAGER only.
 * Query: weekStart (optional). Defaults to current week.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRiyadhNow, toRiyadhDateString } from '@/lib/time';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { computeRiskIndex } from '@/lib/executive/metrics';
import { fetchWeekMetrics } from '@/lib/executive/aggregation';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

export type ExecutiveAlert = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  titleKey: string;
  evidenceKey: string;
  evidence: Record<string, string | number>;
  deepLink?: string;
  weekStart: string;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await resolveScopeForUser(user.id, role, null);
  const boutiqueIds = scope.boutiqueIds;
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const now = getRiyadhNow();
  const todayStr = toRiyadhDateString(now);
  const defaultWeekStart = getWeekStart(now);
  const weekStartParam = request.nextUrl.searchParams.get('weekStart');
  const weekStart =
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)
      ? weekStartParam
      : defaultWeekStart;

  const raw = await fetchWeekMetrics(weekStart, todayStr, boutiqueIds);

  const achievementPct =
    raw.target > 0 ? Math.round((raw.revenue / raw.target) * 100) : 0;
  const overduePct =
    raw.taskTotal > 0 ? Math.round((raw.taskOverdue / raw.taskTotal) * 100) : 0;
  const suspiciousPct =
    raw.taskTotal > 0 ? Math.round((raw.burstCount / raw.taskTotal) * 100) : 0;
  const zoneCompliancePct =
    raw.zoneTotal > 0
      ? Math.round((raw.zoneCompleted / raw.zoneTotal) * 100)
      : 100;
  const balancePct =
    Math.max(raw.amCount, raw.pmCount) > 0
      ? Math.round(
          (Math.min(raw.amCount, raw.pmCount) / Math.max(raw.amCount, raw.pmCount)) * 100
        )
      : 100;

  const risk = computeRiskIndex({
    achievementPct,
    overduePct,
    suspiciousPct,
    scheduleBalancePct: balancePct,
    zoneCompliancePct,
    weekStart,
  });

  const alerts: ExecutiveAlert[] = [];
  let id = 0;

  if (risk.score >= 25) {
    alerts.push({
      id: `risk-${++id}`,
      severity: risk.level === 'HIGH' ? 'high' : risk.level === 'MED' ? 'medium' : 'low',
      titleKey: 'executive.alert.riskTitle',
      evidenceKey: 'executive.alert.riskEvidence',
      evidence: { score: risk.score, level: risk.level, reasons: risk.reasons.join(', ') },
      deepLink: '/executive/insights',
      weekStart,
    });
  }

  if (achievementPct < 80) {
    alerts.push({
      id: `ach-${++id}`,
      severity: achievementPct < 60 ? 'high' : 'medium',
      titleKey: 'executive.alert.achievementTitle',
      evidenceKey: 'executive.alert.achievementEvidence',
      evidence: { achievementPct, target: raw.target, revenue: raw.revenue },
      deepLink: '/dashboard',
      weekStart,
    });
  }

  if (overduePct > 10) {
    alerts.push({
      id: `overdue-${++id}`,
      severity: overduePct > 20 ? 'high' : 'medium',
      titleKey: 'executive.alert.overdueTitle',
      evidenceKey: 'executive.alert.overdueEvidence',
      evidence: { overduePct, overdue: raw.taskOverdue, total: raw.taskTotal },
      deepLink: '/tasks/monitor',
      weekStart,
    });
  }

  if (suspiciousPct > 5) {
    alerts.push({
      id: `susp-${++id}`,
      severity: suspiciousPct > 10 ? 'high' : 'medium',
      titleKey: 'executive.alert.suspiciousTitle',
      evidenceKey: 'executive.alert.suspiciousEvidence',
      evidence: { suspiciousPct, burstCount: raw.burstCount },
      deepLink: '/tasks/monitor',
      weekStart,
    });
  }

  if (zoneCompliancePct < 80) {
    alerts.push({
      id: `zone-${++id}`,
      severity: zoneCompliancePct < 60 ? 'high' : 'medium',
      titleKey: 'executive.alert.zoneTitle',
      evidenceKey: 'executive.alert.zoneEvidence',
      evidence: { zoneCompliancePct, completed: raw.zoneCompleted, total: raw.zoneTotal },
      deepLink: '/inventory/zones',
      weekStart,
    });
  }

  if (balancePct < 70) {
    alerts.push({
      id: `sched-${++id}`,
      severity: balancePct < 50 ? 'high' : 'medium',
      titleKey: 'executive.alert.scheduleTitle',
      evidenceKey: 'executive.alert.scheduleEvidence',
      evidence: { balancePct, am: raw.amCount, pm: raw.pmCount },
      deepLink: '/schedule/edit',
      weekStart,
    });
  }

  return NextResponse.json({
    weekStart,
    alerts,
  });
}
