/**
 * GET /api/sales/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&type=SALE|RETURN|EXCHANGE&page=1&pageSize=50&boutiqueId= (ADMIN optional)
 * RBAC: EMPLOYEE = own rows; ASSISTANT_MANAGER/MANAGER = full boutique; ADMIN = optional boutiqueId.
 * Response: rows with employeeName, isGuestCoverage, sourceBoutiqueName, shift; pagination.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { parseDateRiyadh, formatDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  const boutiqueIdParam = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const scopeResult = await getSalesScope({
    requestBoutiqueId: boutiqueIdParam || undefined,
    request,
  });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  const fromParam = request.nextUrl.searchParams.get('from')?.trim();
  const toParam = request.nextUrl.searchParams.get('to')?.trim();
  const typeParam = request.nextUrl.searchParams.get('type')?.trim().toUpperCase();
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const from = parseDateRiyadh(fromParam || '');
  const to = parseDateRiyadh(toParam || '');
  const fromDate = from.getTime() <= to.getTime() ? from : to;
  const toDate = from.getTime() <= to.getTime() ? to : from;

  const where: {
    boutiqueId?: string;
    employeeId?: string;
    txnDate?: { gte: Date; lte: Date };
    type?: 'SALE' | 'RETURN' | 'EXCHANGE';
  } = {
    txnDate: { gte: fromDate, lte: toDate },
  };

  if (scope.employeeOnly && scope.empId) {
    where.employeeId = scope.empId;
  }
  if (scope.allowedBoutiqueIds.length > 0) {
    where.boutiqueId = scope.effectiveBoutiqueId;
  }
  if (typeParam === 'SALE' || typeParam === 'RETURN' || typeParam === 'EXCHANGE') {
    where.type = typeParam;
  }

  const [total, rows] = await Promise.all([
    prisma.salesTransaction.count({ where }),
    prisma.salesTransaction.findMany({
      where,
      orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        txnDate: true,
        boutiqueId: true,
        employeeId: true,
        type: true,
        source: true,
        referenceNo: true,
        lineNo: true,
        grossAmount: true,
        netAmount: true,
        isGuestCoverage: true,
        coverageSourceBoutiqueId: true,
        coverageShift: true,
        employee: { select: { name: true } },
        boutique: { select: { name: true, code: true } },
      },
    }),
  ]);

  const sourceBoutiqueIds = Array.from(
    new Set(rows.map((r) => r.coverageSourceBoutiqueId).filter((id): id is string => Boolean(id)))
  );
  const boutiques =
    sourceBoutiqueIds.length > 0
      ? await prisma.boutique.findMany({
          where: { id: { in: sourceBoutiqueIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
  const boutiqueMap = new Map(boutiques.map((b) => [b.id, b.name ?? b.code]));

  const items = rows.map((r) => ({
    id: r.id,
    txnDate: formatDateRiyadh(r.txnDate),
    boutiqueId: r.boutiqueId,
    boutiqueName: r.boutique?.name ?? r.boutique?.code,
    employeeId: r.employeeId,
    employeeName: r.employee?.name ?? r.employeeId,
    type: r.type,
    source: r.source,
    referenceNo: r.referenceNo,
    lineNo: r.lineNo,
    grossAmount: r.grossAmount,
    netAmount: r.netAmount,
    isGuestCoverage: r.isGuestCoverage,
    sourceBoutiqueId: r.coverageSourceBoutiqueId,
    sourceBoutiqueName: r.coverageSourceBoutiqueId ? boutiqueMap.get(r.coverageSourceBoutiqueId) : undefined,
    shift: r.coverageShift,
  }));

  return NextResponse.json({
    from: formatDateRiyadh(fromDate),
    to: formatDateRiyadh(toDate),
    page,
    pageSize,
    total,
    items,
  });
}
