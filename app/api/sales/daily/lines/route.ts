/**
 * POST /api/sales/daily/lines
 * Body: { boutiqueId, date, employeeId, amountSar }
 * RBAC: ADMIN, MANAGER. Upserts line + audit. Post-lock edit forces unlock.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { validateSarInteger, reconcileSummary } from '@/lib/sales/reconcile';
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
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
  const amountSarResult = validateSarInteger(body.amountSar);

  if (!boutiqueId || !employeeId) {
    return NextResponse.json({ error: 'boutiqueId and employeeId required' }, { status: 400 });
  }
  if (!amountSarResult.ok) {
    return NextResponse.json({ error: amountSarResult.error }, { status: 400 });
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

  const employee = await prisma.employee.findUnique({
    where: { empId: employeeId },
    select: { boutiqueId: true },
  });
  if (!employee || employee.boutiqueId !== boutiqueId) {
    return NextResponse.json(
      { error: 'Employee must belong to this boutique' },
      { status: 400 }
    );
  }

  let summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
    include: { lines: true },
  });

  if (!summary) {
    summary = await prisma.boutiqueSalesSummary.create({
      data: {
        boutiqueId,
        date,
        totalSar: 0,
        status: 'DRAFT',
        enteredById: user.id,
      },
      include: { lines: true },
    });
    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action: 'SUMMARY_CREATE',
      metadata: { totalSar: 0, autoCreated: true },
    });
  }

  const amountSar = amountSarResult.value;
  const wasLocked = summary.status === 'LOCKED';

  if (wasLocked) {
    await prisma.boutiqueSalesSummary.update({
      where: { id: summary.id },
      data: { status: 'DRAFT', lockedById: null, lockedAt: null },
    });
    await recordSalesLedgerAudit({
      boutiqueId,
      date,
      actorId: user.id,
      action: 'POST_LOCK_EDIT',
      reason: 'Line upsert after lock; auto-unlock',
      metadata: { summaryId: summary.id, employeeId, amountSar },
    });
  }

  const existingLine = summary.lines.find((l) => l.employeeId === employeeId);
  if (existingLine) {
    await prisma.boutiqueSalesLine.update({
      where: { id: existingLine.id },
      data: { amountSar, updatedAt: new Date() },
    });
  } else {
    await prisma.boutiqueSalesLine.create({
      data: {
        summaryId: summary.id,
        employeeId,
        amountSar,
        source: 'MANUAL',
      },
    });
  }

  await recordSalesLedgerAudit({
    boutiqueId,
    date,
    actorId: user.id,
    action: 'LINE_UPSERT',
    metadata: { employeeId, amountSar, wasLocked },
  });

  await syncSummaryToSalesEntry(summary.id, user.id);

  const recon = await reconcileSummary(summary.id);
  return NextResponse.json({
    ok: true,
    linesTotal: recon?.linesTotal ?? 0,
    summaryTotal: recon?.summaryTotal ?? summary.totalSar,
    diff: recon?.diff ?? 0,
    canLock: recon?.canLock ?? false,
    status: recon?.status ?? summary.status,
  });
}
