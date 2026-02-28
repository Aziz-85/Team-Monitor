/**
 * GET /api/executive/compare?month=YYYY-MM&global=true — Cross-boutique comparison. ADMIN + MANAGER only.
 * global=true: ADMIN only, all boutiques + audit. MANAGER: always scope. Money SAR integer only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveExecutiveBoutiqueIds } from '@/lib/executive/scope';
import { calculateBoutiqueScore } from '@/lib/executive/score';
import type { Role } from '@prisma/client';

export type CompareBoutiqueRow = {
  boutiqueId: string;
  code: string;
  name: string;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  sales: number;
  target: number;
  achievementPct: number | null;
  overduePct: number;
  riskScore: number;
};

export type CompareRegionRollup = {
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  boutiqueIds: string[];
  sales: number;
  target: number;
  achievementPct: number | null;
};

export type CompareGroupRollup = {
  groupId: string;
  groupCode: string;
  groupName: string;
  boutiqueIds: string[];
  sales: number;
  target: number;
  achievementPct: number | null;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const globalParam = request.nextUrl.searchParams.get('global');
  const { boutiqueIds } = await resolveExecutiveBoutiqueIds(user.id, role, globalParam, 'EXECUTIVE_COMPARE');
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get('month');
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : new Date().toISOString().slice(0, 7);

  const [boutiques, revenueByBoutique, targets, groupMembers] = await Promise.all([
    prisma.boutique.findMany({
      where: { id: { in: boutiqueIds }, isActive: true },
      select: { id: true, code: true, name: true, regionId: true, region: { select: { code: true, name: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.salesEntry.groupBy({
      by: ['boutiqueId'],
      where: { month: monthKey, boutiqueId: { in: boutiqueIds } },
      _sum: { amount: true },
    }),
    prisma.boutiqueMonthlyTarget.findMany({
      where: { month: monthKey, boutiqueId: { in: boutiqueIds } },
      select: { boutiqueId: true, amount: true },
    }),
    prisma.boutiqueGroupMember.findMany({
      where: { boutiqueId: { in: boutiqueIds } },
      include: { group: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  const targetByBoutique = new Map<string, number>();
  for (const t of targets) {
    if (t.boutiqueId) targetByBoutique.set(t.boutiqueId, t.amount);
  }
  const revenueByBoutiqueMap = new Map<string, number>();
  for (const r of revenueByBoutique) {
    if (r.boutiqueId) revenueByBoutiqueMap.set(r.boutiqueId, r._sum.amount ?? 0);
  }

  const boutiquesRows: CompareBoutiqueRow[] = [];
  for (const b of boutiques) {
    const revenue = revenueByBoutiqueMap.get(b.id) ?? 0;
    const target = targetByBoutique.get(b.id) ?? 0;
    const achievementPct = target > 0 ? Math.round((revenue / target) * 100) : null;
    let riskScore = 0;
    try {
      const scoreResult = await calculateBoutiqueScore(monthKey, [b.id]);
      riskScore = scoreResult.score;
    } catch {
      riskScore = achievementPct ?? 0;
    }
    const overduePct = 0;
    boutiquesRows.push({
      boutiqueId: b.id,
      code: b.code,
      name: b.name,
      regionId: b.regionId,
      regionCode: b.region?.code ?? null,
      regionName: b.region?.name ?? null,
      sales: revenue,
      target,
      achievementPct,
      overduePct,
      riskScore,
    });
  }

  const regionRollups: CompareRegionRollup[] = [];
  const byRegion = new Map<string | null, CompareBoutiqueRow[]>();
  for (const row of boutiquesRows) {
    const key = row.regionId;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key)!.push(row);
  }
  for (const [regionId, rows] of Array.from(byRegion.entries())) {
    const totalSales = rows.reduce((s, r) => s + r.sales, 0);
    const target = rows.reduce((s, r) => s + r.target, 0);
    regionRollups.push({
      regionId,
      regionCode: rows[0]?.regionCode ?? null,
      regionName: rows[0]?.regionName ?? null,
      boutiqueIds: rows.map((r) => r.boutiqueId),
      sales: totalSales,
      target,
      achievementPct: target > 0 ? Math.round((totalSales / target) * 100) : null,
    });
  }

  const groupRollups: CompareGroupRollup[] = [];
  const byGroup = new Map<string, CompareBoutiqueRow[]>();
  for (const m of groupMembers) {
    const g = m.group;
    const key = g.id;
    if (!byGroup.has(key)) byGroup.set(key, []);
    const row = boutiquesRows.find((r) => r.boutiqueId === m.boutiqueId);
    if (row) byGroup.get(key)!.push(row);
  }
  for (const [groupId, rows] of Array.from(byGroup.entries())) {
    if (rows.length === 0) continue;
    const member = groupMembers.find((m) => m.group.id === groupId)!;
    const totalSales = rows.reduce((s, r) => s + r.sales, 0);
    const target = rows.reduce((s, r) => s + r.target, 0);
    groupRollups.push({
      groupId: member.group.id,
      groupCode: member.group.code ?? '',
      groupName: member.group.name ?? '',
      boutiqueIds: rows.map((r) => r.boutiqueId),
      sales: totalSales,
      target,
      achievementPct: target > 0 ? Math.round((totalSales / target) * 100) : null,
    });
  }

  return NextResponse.json({
    month: monthKey,
    boutiques: boutiquesRows,
    regions: regionRollups,
    groups: groupRollups,
  });
}
