import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import type { Role, LeaveType, LeaveStatus } from '@prisma/client';

const VALID_LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'EXHIBITION', 'SICK', 'OTHER_BRANCH', 'EMERGENCY', 'OTHER'];
const VALID_LEAVE_STATUSES: LeaveStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;
  const { boutiqueId } = scope;

  const { id } = await params;
  const body = await request.json();

  const empId = body.empId != null ? String(body.empId).trim() : undefined;
  const type = body.type != null ? String(body.type).toUpperCase() as LeaveType : undefined;
  const status = body.status != null && VALID_LEAVE_STATUSES.includes(body.status as LeaveStatus) ? (body.status as LeaveStatus) : undefined;
  const startDate = body.startDate != null ? new Date(String(body.startDate) + 'T00:00:00Z') : undefined;
  const endDate = body.endDate != null ? new Date(String(body.endDate) + 'T00:00:00Z') : undefined;
  const notes = body.notes !== undefined ? (String(body.notes).trim() || null) : undefined;

  if (type !== undefined && !VALID_LEAVE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 });
  }
  if (startDate !== undefined && endDate !== undefined && startDate > endDate) {
    return NextResponse.json({ error: 'startDate must be <= endDate' }, { status: 400 });
  }

  const existing = await prisma.leave.findFirst({
    where: { id, employee: { boutiqueId } },
    include: { employee: { select: { empId: true, name: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (empId !== undefined) update.empId = empId;
  if (type !== undefined) update.type = type;
  if (status !== undefined) update.status = status;
  if (startDate !== undefined) update.startDate = startDate;
  if (endDate !== undefined) update.endDate = endDate;
  if (notes !== undefined) update.notes = notes;

  const leave = await prisma.leave.update({
    where: { id },
    data: update,
    include: { employee: { select: { empId: true, name: true } } },
  });
  clearCoverageValidationCache();
  return NextResponse.json(leave);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;
  const { boutiqueId } = scope;

  const { id } = await params;
  const existing = await prisma.leave.findFirst({
    where: { id, employee: { boutiqueId } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.leave.delete({ where: { id } });
  clearCoverageValidationCache();
  return NextResponse.json({ ok: true });
}
