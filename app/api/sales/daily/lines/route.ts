/**
 * POST /api/sales/daily/lines — upsert line
 * DELETE /api/sales/daily/lines — body { boutiqueId, date, employeeId } removes that line
 * RBAC: ADMIN, MANAGER, AREA_MANAGER. Post-lock edit/delete forces unlock.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { validateSarInteger } from '@/lib/sales/reconcile';
import { recordBoutiqueSale, removeBoutiqueSaleLine } from '@/lib/sales/recordBoutiqueSale';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'AREA_MANAGER'] as const;

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
  const trustedId = await getTrustedOperationalBoutiqueId(user, request);
  assertOperationalBoutiqueId(trustedId ?? undefined);
  if (!trustedId || boutiqueId !== trustedId) {
    return NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 });
  }
  const canManage = await canManageSalesInBoutique(user.id, user.role as Role, boutiqueId, trustedId);
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to manage sales for this boutique' }, { status: 403 });
  }

  const result = await recordBoutiqueSale({
    boutiqueId,
    date,
    employeeId,
    amountSar: amountSarResult.value,
    actorUserId: user.id,
    requireEmployeeInBoutique: true,
  });

  if (!result.ok) {
    const status =
      result.status === 'conflict' ? 409 : result.status === 'validation' ? 400 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    warnings: result.warnings,
    linesTotal: result.reconcile.linesTotal,
    summaryTotal: result.reconcile.summaryTotal,
    diff: result.reconcile.diff,
    canLock: result.reconcile.canLock,
    status: result.reconcile.status,
  });
}

export async function DELETE(request: NextRequest) {
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

  if (!boutiqueId || !employeeId) {
    return NextResponse.json({ error: 'boutiqueId and employeeId required' }, { status: 400 });
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

  const result = await removeBoutiqueSaleLine({
    boutiqueId,
    date,
    employeeId,
    actorUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    linesTotal: result.reconcile?.linesTotal ?? 0,
    summaryTotal: result.reconcile?.summaryTotal ?? 0,
    diff: result.reconcile?.diff ?? 0,
    canLock: result.reconcile?.canLock ?? false,
    status: result.reconcile?.status ?? 'DRAFT',
  });
}
