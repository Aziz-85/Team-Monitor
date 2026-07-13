/**
 * GET rollback preview for one SalesEntryImportBatch (SAR impact, counts).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedRole, type SessionUser } from '@/lib/auth/index';
import { checkSalesEntryImportBatchAccess } from '@/lib/permissions/resourceAccess';
import { previewSalesEntryImportRollback } from '@/lib/sales/salesEntryImportRollback';

const ADMIN_ROLES = ['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireAuthenticatedRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const access = await checkSalesEntryImportBatchAccess(user, id, {
    requireManageSales: true,
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === 'NOT_FOUND' ? 'Not found' : 'Forbidden' },
      { status: access.reason === 'NOT_FOUND' ? 404 : 403 }
    );
  }
  const preview = await previewSalesEntryImportRollback(id);
  if (!preview) {
    return NextResponse.json({ error: 'Batch not found or not in APPLIED status' }, { status: 404 });
  }
  return NextResponse.json({ preview });
}
