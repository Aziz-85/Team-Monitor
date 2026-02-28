/**
 * POST /api/sales/daily/lock
 * Body: { boutiqueId, date }
 * RBAC: ADMIN, MANAGER. LOCK only when diff === 0.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { reconcileSummary } from '@/lib/sales/reconcile';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { syncSummaryToSalesEntry } from '@/lib/sales/syncLedgerToSalesEntry';
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

  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
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

  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
  });

  if (!summary) {
    return NextResponse.json({ error: 'No summary for this boutique and date' }, { status: 404 });
  }

  if (summary.status === 'LOCKED') {
    return NextResponse.json({ ok: true, message: 'Already locked', status: 'LOCKED' });
  }

  const recon = await reconcileSummary(summary.id);
  if (!recon || !recon.canLock) {
    return NextResponse.json(
      {
        error: 'Cannot lock: lines total must equal summary total',
        linesTotal: recon?.linesTotal,
        summaryTotal: recon?.summaryTotal,
        diff: recon?.diff,
      },
      { status: 400 }
    );
  }

  await prisma.boutiqueSalesSummary.update({
    where: { id: summary.id },
    data: {
      status: 'LOCKED',
      lockedById: user.id,
      lockedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await recordSalesLedgerAudit({
    boutiqueId,
    date,
    actorId: user.id,
    action: 'LOCK',
    metadata: { summaryId: summary.id, totalSar: summary.totalSar, linesTotal: recon.linesTotal },
  });

  await syncSummaryToSalesEntry(summary.id, user.id);

  return NextResponse.json({
    ok: true,
    status: 'LOCKED',
    summaryId: summary.id,
  });
}
