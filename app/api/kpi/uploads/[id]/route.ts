/**
 * GET /api/kpi/uploads/[id] — Get one upload (scope). DELETE — ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import { logKpiAudit } from '@/lib/kpi/audit';
import type { Role } from '@prisma/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const resolved = await resolveScopeForUser(user.id, user.role as Role, null);
  const upload = await prisma.kpiUpload.findUnique({
    where: { id },
    include: { snapshot: true },
  });
  if (!upload) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!resolved.boutiqueIds.includes(upload.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ upload });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const upload = await prisma.kpiUpload.findUnique({ where: { id } });
  if (!upload) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.kpiUpload.delete({ where: { id } });
  await logKpiAudit({
    actorId: user.id,
    action: 'KPI_UPLOAD_DELETED',
    boutiqueId: upload.boutiqueId,
    empId: upload.empId,
    periodKey: upload.periodKey,
    metadata: { uploadId: id },
  });
  return NextResponse.json({ ok: true });
}
