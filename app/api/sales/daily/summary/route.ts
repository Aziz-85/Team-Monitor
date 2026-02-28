/**
 * POST /api/sales/daily/summary
 * Body: { boutiqueId, date, totalSar }
 * RBAC: ADMIN, MANAGER. Creates/updates summary (DRAFT) + audit.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { validateSarInteger } from '@/lib/sales/reconcile';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER'] as const;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '';
  const dateParam = typeof body.date === 'string' ? body.date : '';
  const totalSarResult = validateSarInteger(body.totalSar);

  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  if (!totalSarResult.ok) {
    return NextResponse.json({ error: totalSarResult.error }, { status: 400 });
  }

  const date = parseDateRiyadh(dateParam);
  const scope = await getOperationalScope(request);
  assertOperationalBoutiqueId(scope?.boutiqueId);
  if (!scope?.boutiqueId || scope.boutiqueId !== boutiqueId) {
    return NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 });
  }
  const canManage = await canManageSalesInBoutique(user.id, user.role as Role, boutiqueId);
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to manage sales for this boutique' }, { status: 403 });
  }

  const existing = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
  });

  const action = existing ? 'SUMMARY_UPDATE' : 'SUMMARY_CREATE';
  const totalSar = totalSarResult.value;

  if (existing) {
    if (existing.status === 'LOCKED') {
      return NextResponse.json(
        { error: 'Cannot update summary when locked. Unlock first or use post-lock edit with reason.' },
        { status: 400 }
      );
    }
    await prisma.boutiqueSalesSummary.update({
      where: { id: existing.id },
      data: { totalSar, updatedAt: new Date() },
    });
    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action,
      metadata: { previousTotalSar: existing.totalSar, newTotalSar: totalSar },
    });
  } else {
    await prisma.boutiqueSalesSummary.create({
      data: {
        boutiqueId,
        date,
        totalSar,
        status: 'DRAFT',
        enteredById: user.id,
      },
    });
    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action,
      metadata: { totalSar },
    });
  }

  await syncDailyLedgerToSalesEntry({ boutiqueId, date, actorUserId: user.id });

  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
    include: { lines: true },
  });
  const linesTotal = summary?.lines.reduce((s, l) => s + l.amountSar, 0) ?? 0;
  const diff = (summary?.totalSar ?? totalSar) - linesTotal;

  return NextResponse.json({
    ok: true,
    summary: summary
      ? {
          id: summary.id,
          boutiqueId: summary.boutiqueId,
          date: summary.date.toISOString().slice(0, 10),
          totalSar: summary.totalSar,
          status: summary.status,
          linesTotal,
          diff,
        }
      : null,
  });
}
