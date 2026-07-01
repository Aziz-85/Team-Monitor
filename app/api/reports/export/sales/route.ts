/**
 * GET/POST /api/reports/export/sales
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';
import { buildSalesReportExportWorkbook } from '@/lib/services/salesReportExport';
import {
  excelDownloadResponse,
  getQueryString,
  parseQueryBool,
} from '@/lib/services/reportExportHandlers';
import { resolveSimpleDateRange } from '@/lib/services/reportExportCommon';

export const dynamic = 'force-dynamic';

async function resolveSalesBoutiques(
  request: NextRequest,
  boutiqueIdParam: string | undefined
): Promise<{ boutiqueIds: string[]; labelsById: Map<string, string> } | { error: string }> {
  const wantsAll = boutiqueIdParam === 'all' || boutiqueIdParam === '__all__';
  const scopeResult = await getSalesScope({
    requestBoutiqueId: wantsAll ? undefined : boutiqueIdParam,
    request,
  });
  if (scopeResult.res) {
    const status = scopeResult.res.status;
    return { error: status === 401 ? 'Unauthorized' : 'Forbidden' };
  }
  const scope = scopeResult.scope!;

  let boutiqueIds: string[];
  if (wantsAll) {
    if (scope.role === 'AREA_MANAGER' && scope.allowedBoutiqueIds.length > 1) {
      boutiqueIds = scope.allowedBoutiqueIds;
    } else if (
      (scope.role === 'ADMIN' || scope.role === 'SUPER_ADMIN') &&
      scope.allowedBoutiqueIds.length === 0
    ) {
      const all = await prisma.boutique.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      boutiqueIds = all.map((b) => b.id);
    } else if (scope.allowedBoutiqueIds.length > 1) {
      boutiqueIds = scope.allowedBoutiqueIds;
    } else {
      return { error: 'Multi-boutique export is not available for your account.' };
    }
  } else {
    boutiqueIds = scope.effectiveBoutiqueId ? [scope.effectiveBoutiqueId] : scope.allowedBoutiqueIds;
  }

  if (boutiqueIds.length === 0) {
    return { error: 'Select a boutique in the scope selector.' };
  }

  const rows = await prisma.boutique.findMany({
    where: { id: { in: boutiqueIds } },
    select: { id: true, name: true, code: true },
  });
  const labelsById = new Map(rows.map((b) => [b.id, `${b.name} (${b.code})`]));

  return { boutiqueIds, labelsById };
}

async function handleExport(request: NextRequest, source: URLSearchParams | Record<string, unknown>) {
  const startDate = getQueryString(source, 'startDate');
  const endDate = getQueryString(source, 'endDate');
  const range = resolveSimpleDateRange(startDate, endDate);
  if ('error' in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const boutiqueResult = await resolveSalesBoutiques(request, getQueryString(source, 'boutiqueId'));
  if ('error' in boutiqueResult) {
    return NextResponse.json({ error: boutiqueResult.error }, { status: 403 });
  }

  const scopeResult = await getSalesScope({ request });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  try {
    const { buffer, startDate: outStart, endDate: outEnd } = await buildSalesReportExportWorkbook({
      startDate: range.startDate,
      endDate: range.endDate,
      boutiqueIds: boutiqueResult.boutiqueIds,
      boutiqueLabelsById: boutiqueResult.labelsById,
      userId: scope.employeeOnly ? scope.userId : undefined,
      includeSummary: parseQueryBool(source, 'includeSummary', true),
      includeDaily: parseQueryBool(source, 'includeDaily', true),
      includeEmployee: parseQueryBool(source, 'includeEmployee', true),
      includeBoutique: parseQueryBool(source, 'includeBoutique', true),
      includeDiscounts: parseQueryBool(source, 'includeDiscounts', true),
      includePaymentDetails: parseQueryBool(source, 'includePaymentDetails', true),
    });

    return excelDownloadResponse(buffer, `sales-export-${outStart}-to-${outEnd}.xlsx`);
  } catch (err) {
    console.error('[reports/export/sales]', err);
    const message = err instanceof Error ? err.message : 'Failed to generate export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleExport(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return handleExport(request, body);
}
