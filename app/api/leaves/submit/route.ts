/**
 * POST /api/leaves/submit — transition DRAFT -> SUBMITTED. Employee (own request only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeLeaveAudit } from '@/lib/leaveAudit';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim() : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
  if (req.userId !== user.id) {
    return NextResponse.json({ error: 'You can only submit your own leave request' }, { status: 403 });
  }
  if (req.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only DRAFT requests can be submitted' }, { status: 400 });
  }

  const before = JSON.stringify({ status: req.status });
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'SUBMITTED' },
  });
  await writeLeaveAudit({
    actorUserId: user.id,
    action: 'LEAVE_SUBMITTED',
    entityId: id,
    boutiqueId: req.boutiqueId,
    beforeJson: before,
    afterJson: JSON.stringify({ status: 'SUBMITTED' }),
  });

  return NextResponse.json({ ok: true, status: 'SUBMITTED' });
}
