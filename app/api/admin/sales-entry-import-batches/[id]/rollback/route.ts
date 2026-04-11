/**
 * POST — execute rollback for one SalesEntryImportBatch (APPLIED only).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { executeSalesEntryImportRollback } from '@/lib/sales/salesEntryImportRollback';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Set confirm: true in JSON body to execute rollback.' }, { status: 400 });
  }

  const { id } = await params;
  const result = await executeSalesEntryImportRollback(id, user.id);
  return NextResponse.json({ result });
}
