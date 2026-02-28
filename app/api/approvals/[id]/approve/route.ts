import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { approveRequest } from '@/lib/services/approvals';
import type { Role } from '@prisma/client';

const APPROVER_ROLES: Role[] = ['MANAGER', 'ADMIN'];

/**
 * POST /api/approvals/[id]/approve
 * Execute the request and set APPROVED. Idempotent if already decided.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(APPROVER_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { comment?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;

  const result = await approveRequest(id, user, comment);

  if (!result.ok) {
    if (result.error === 'Request not found') {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error === 'Already decided') {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    if (result.code === 'LOCKED') {
      return NextResponse.json({ error: result.error }, { status: 423 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: result.result });
}
