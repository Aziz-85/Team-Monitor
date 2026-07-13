/**
 * POST — execute rollback for one SalesEntryImportBatch (APPLIED only).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedRole, requireMutableUser, type SessionUser } from '@/lib/auth/index';
import { checkSalesEntryImportBatchAccess } from '@/lib/permissions/resourceAccess';
import { executeSalesEntryImportRollback } from '@/lib/sales/salesEntryImportRollback';

const ADMIN_ROLES = ['MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    await requireMutableUser();
    user = await requireAuthenticatedRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Set confirm: true in JSON body to execute rollback.' }, { status: 400 });
  }

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
  const result = await executeSalesEntryImportRollback(id, user.id);
  return NextResponse.json({ result });
}
