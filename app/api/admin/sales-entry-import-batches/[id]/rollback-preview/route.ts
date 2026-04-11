/**
 * GET rollback preview for one SalesEntryImportBatch (SAR impact, counts).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { previewSalesEntryImportRollback } from '@/lib/sales/salesEntryImportRollback';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const preview = await previewSalesEntryImportRollback(id);
  if (!preview) {
    return NextResponse.json({ error: 'Batch not found or not in APPLIED status' }, { status: 404 });
  }
  return NextResponse.json({ preview });
}
