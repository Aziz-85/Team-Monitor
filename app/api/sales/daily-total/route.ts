/**
 * GET/POST /api/sales/daily-total — Boutique-level daily total (no per-employee breakdown).
 * RBAC: ADMIN, MANAGER, AREA_MANAGER with canManageSalesInBoutique (same family as daily lines).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getTrustedOperationalBoutiqueId } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { canManageSalesInBoutique } from '@/lib/membershipPermissions';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { formatDateRiyadh, normalizeDateOnlyRiyadh } from '@/lib/time';
import { parseOptionalNonNegativeInt } from '@/lib/sales/parseOptionalSalesMetrics';
import { upsertCanonicalSalesEntry } from '@/lib/sales/upsertSalesEntry';
import { SALES_ENTRY_SOURCE } from '@/lib/sales/salesEntrySources';
import {
  ensureSystemBranchTotalUserForBoutique,
  getSystemBranchTotalUserId,
} from '@/lib/sales/systemBranchTotal';
import { SYSTEM_BRANCH_TOTAL_EMP_ID } from '@/lib/sales/systemBranchTotalConstants';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'AREA_MANAGER'] as const;

async function authorize(request: NextRequest, boutiqueId: string) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ALLOWED_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const trustedId = await getTrustedOperationalBoutiqueId(user, request);
  assertOperationalBoutiqueId(trustedId ?? undefined);
  if (!trustedId || boutiqueId !== trustedId) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'Boutique not in your operational scope' }, { status: 403 }),
    };
  }
  const canManage = await canManageSalesInBoutique(user.id, user.role as Role, boutiqueId, trustedId);
  if (!canManage) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: 'You do not have permission to manage sales for this boutique' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, user };
}

async function hasPositiveEmployeeLedgerLines(boutiqueId: string, date: Date): Promise<boolean> {
  const summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId, date } },
    include: { lines: true },
  });
  if (!summary) return false;
  return summary.lines.some((l) => l.employeeId !== SYSTEM_BRANCH_TOTAL_EMP_ID && l.amountSar > 0);
}

async function hasPositiveNonBranchSalesEntries(boutiqueId: string, dateKey: string): Promise<boolean> {
  const sysUid = await getSystemBranchTotalUserId();
  const row = await prisma.salesEntry.findFirst({
    where: {
      boutiqueId,
      dateKey,
      amount: { gt: 0 },
      ...(sysUid ? { NOT: { userId: sysUid } } : {}),
    },
    select: { id: true },
  });
  return row != null;
}

export async function GET(request: NextRequest) {
  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  const dateRaw = request.nextUrl.searchParams.get('date')?.trim() ?? '';
  if (!boutiqueId || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json({ error: 'boutiqueId and date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const auth = await authorize(request, boutiqueId);
  if (!auth.ok) return auth.res;

  const date = parseDateRiyadh(dateRaw);
  const dateOnly = normalizeDateOnlyRiyadh(date);
  const dateKey = formatDateRiyadh(dateOnly);

  const [hasEmployeeLedgerLines, hasNonBranchSales, sysUid] = await Promise.all([
    hasPositiveEmployeeLedgerLines(boutiqueId, date),
    hasPositiveNonBranchSalesEntries(boutiqueId, dateKey),
    getSystemBranchTotalUserId(),
  ]);

  let branchTotal: {
    amount: number;
    invoiceCount: number | null;
    pieceCount: number | null;
    source: string | null;
  } | null = null;
  if (sysUid) {
    const entry = await prisma.salesEntry.findUnique({
      where: { boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId: sysUid } },
      select: { amount: true, invoiceCount: true, pieceCount: true, source: true },
    });
    if (entry && entry.amount > 0) {
      branchTotal = {
        amount: entry.amount,
        invoiceCount: entry.invoiceCount ?? null,
        pieceCount: entry.pieceCount ?? null,
        source: entry.source ?? null,
      };
    }
  }

  const hasBranchDailyTotal = branchTotal != null && branchTotal.amount > 0;

  return NextResponse.json({
    date: dateKey,
    boutiqueId,
    hasEmployeeLedgerLines,
    hasNonBranchSalesEntries: hasNonBranchSales,
    hasBranchDailyTotal,
    branchTotal,
    /** True when a branch total row exists but cannot coexist with employee lines (conflict). */
    conflict:
      hasBranchDailyTotal && hasEmployeeLedgerLines
        ? 'branch_total_and_employee_lines'
        : null,
  });
}

export async function POST(request: NextRequest) {
  let body: {
    date?: string;
    boutiqueId?: string;
    amount?: number;
    invoiceCount?: number | null;
    pieceCount?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '';
  const dateRaw = typeof body.date === 'string' ? body.date.trim() : '';
  if (!boutiqueId || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json({ error: 'boutiqueId and date (YYYY-MM-DD) required' }, { status: 400 });
  }

  const auth = await authorize(request, boutiqueId);
  if (!auth.ok) return auth.res;
  const { user } = auth;

  if (body.amount === undefined || body.amount === null) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 });
  }
  const rawAmt = Number(body.amount);
  if (!Number.isFinite(rawAmt) || rawAmt < 0) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
  }
  const amount = Math.round(rawAmt);
  if (amount !== rawAmt) {
    return NextResponse.json({ error: 'amount must be an integer (SAR)' }, { status: 400 });
  }

  const invParsed = parseOptionalNonNegativeInt(body.invoiceCount, 'invoiceCount');
  if ('error' in invParsed) {
    return NextResponse.json({ error: invParsed.error }, { status: 400 });
  }
  const pcParsed = parseOptionalNonNegativeInt(body.pieceCount, 'pieceCount');
  if ('error' in pcParsed) {
    return NextResponse.json({ error: pcParsed.error }, { status: 400 });
  }

  const date = parseDateRiyadh(dateRaw);
  const dateOnly = normalizeDateOnlyRiyadh(date);
  const dateKey = formatDateRiyadh(dateOnly);

  if (await hasPositiveEmployeeLedgerLines(boutiqueId, date)) {
    return NextResponse.json(
      {
        error:
          'Cannot save daily total because employee sales lines already exist for this date.',
      },
      { status: 409 }
    );
  }

  if (await hasPositiveNonBranchSalesEntries(boutiqueId, dateKey)) {
    return NextResponse.json(
      {
        error:
          'Cannot save daily total because non-branch sales entries already exist for this date.',
      },
      { status: 409 }
    );
  }

  const systemUserId = await ensureSystemBranchTotalUserForBoutique(boutiqueId);

  const result = await upsertCanonicalSalesEntry({
    kind: 'direct',
    boutiqueId,
    userId: systemUserId,
    amount,
    source: SALES_ENTRY_SOURCE.BRANCH_DAILY_TOTAL,
    actorUserId: user.id,
    date: dateOnly,
    allowLockedOverride: true,
    ...(invParsed.provided ? { invoiceCount: invParsed.value } : {}),
    ...(pcParsed.provided ? { pieceCount: pcParsed.value } : {}),
  });

  if (result.status === 'rejected_precedence') {
    return NextResponse.json(
      {
        error: 'Cannot save daily total: a higher-priority source already owns this row.',
        existingSource: result.existingSource,
      },
      { status: 409 }
    );
  }
  if (result.status === 'rejected_invalid') {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const entry = await prisma.salesEntry.findUnique({
    where: {
      boutiqueId_dateKey_userId: { boutiqueId, dateKey, userId: systemUserId },
    },
    select: { id: true, amount: true, invoiceCount: true, pieceCount: true, source: true, dateKey: true },
  });

  return NextResponse.json({
    ok: true,
    date: dateKey,
    boutiqueId,
    salesEntry: entry,
    writeStatus: result.status,
  });
}
