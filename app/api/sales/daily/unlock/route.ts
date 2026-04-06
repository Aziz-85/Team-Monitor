/**
 * POST /api/sales/daily/unlock
 * Body: { boutiqueId, date }
 * RBAC: ADMIN, SUPER_ADMIN only. Reverts summary to DRAFT so the day can be edited again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { reconcileSummary } from '@/lib/sales/reconcile';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Only administrators can unlock the daily ledger.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '';
  const dateParam = typeof body.date === 'string' ? body.date : '';

  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }

  const date = parseDateRiyadh(dateParam);
  const trustedId = await getTrustedOperationalBoutiqueId(user, request);
  assertOperationalBoutiqueId(trustedId ?? undefined);
  if (!trustedId || boutiqueId !== trustedId) {
    return NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 });
  }
  const canManage = await canManageSalesInBoutique(user.id, user.role as Role, boutiqueId, trustedId);
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to manage sales for this boutique' }, { status: 403 });
  }

  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
  });

  if (!summary) {
    return NextResponse.json({ error: 'No summary for this boutique and date' }, { status: 404 });
  }

  if (summary.status !== 'LOCKED') {
    const recon = await reconcileSummary(summary.id);
    return NextResponse.json({
      ok: true,
      message: 'Already unlocked',
      status: summary.status,
      canLock: recon?.canLock ?? false,
      linesTotal: recon?.linesTotal ?? 0,
      diff: recon?.diff ?? 0,
    });
  }

  await prisma.boutiqueSalesSummary.update({
    where: { id: summary.id },
    data: {
      status: 'DRAFT',
      lockedById: null,
      lockedAt: null,
      updatedAt: new Date(),
    },
  });

  const recon = await reconcileSummary(summary.id);

  await recordSalesLedgerAudit({
    boutiqueId,
    date,
    actorId: user.id,
    action: 'UNLOCK',
    metadata: { summaryId: summary.id, totalSar: summary.totalSar, linesTotal: recon?.linesTotal },
  });

  return NextResponse.json({
    ok: true,
    status: 'DRAFT',
    canLock: recon?.canLock ?? false,
    linesTotal: recon?.linesTotal ?? 0,
    diff: recon?.diff ?? 0,
    summaryId: summary.id,
  });
}
