/**
 * PATCH /api/sales/import-issues/:id
 * Body: { status: 'RESOLVED' | 'IGNORED' }
 * RBAC: MANAGER (active boutique only), ADMIN (any). ASSISTANT_MANAGER/EMPLOYEE: 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSalesScope } from '@/lib/sales/ledgerRbac';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await getSalesScope({ requireResolveIssues: true, request });
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope;

  const id = (await params).id?.trim();
  if (!id) {
    return NextResponse.json({ error: 'Issue id required' }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = (body.status ?? '').toUpperCase();
  if (status !== 'RESOLVED' && status !== 'IGNORED') {
    return NextResponse.json(
      { error: 'status must be RESOLVED or IGNORED' },
      { status: 400 }
    );
  }

  const issue = await prisma.importIssue.findUnique({
    where: { id },
    include: { batch: { select: { boutiqueId: true } } },
  });
  if (!issue) {
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  if (scope.role !== 'ADMIN' && issue.batch.boutiqueId !== scope.effectiveBoutiqueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  await prisma.importIssue.update({
    where: { id },
    data: {
      status: status as 'RESOLVED' | 'IGNORED',
      resolvedAt: now,
      resolvedById: scope.userId,
      updatedAt: now,
    },
  });

  return NextResponse.json({ id, status });
}
