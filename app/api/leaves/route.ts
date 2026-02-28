/**
 * Legacy Leave (empId-based) + redirect to requests for new flow.
 * GET /api/leaves — list Leave (legacy) for MANAGER/ADMIN with filters.
 * POST /api/leaves — create Leave (legacy) for MANAGER/ADMIN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import type { Role, LeaveType } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VALID_TYPES: LeaveType[] = ['ANNUAL', 'EXHIBITION', 'SICK', 'OTHER_BRANCH', 'EMERGENCY', 'OTHER'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId: scopeId } = scopeResult;

  const { searchParams } = new URL(request.url);
  const empId = searchParams.get('empId') ?? undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const type = searchParams.get('type') ?? undefined;

  const where: {
    empId?: string;
    type?: LeaveType;
    startDate?: { gte?: Date; lte?: Date };
    endDate?: { gte?: Date; lte?: Date };
    employee: { boutiqueId: string };
  } = { employee: { boutiqueId: scopeId } };
  if (empId) where.empId = empId;
  if (type && VALID_TYPES.includes(type as LeaveType)) where.type = type as LeaveType;
  if (from) {
    const d = new Date(from + 'T00:00:00Z');
    if (!isNaN(d.getTime())) where.startDate = { ...where.startDate, gte: d };
  }
  if (to) {
    const d = new Date(to + 'T00:00:00Z');
    if (!isNaN(d.getTime())) where.endDate = { ...where.endDate, lte: d };
  }

  const leaves = await prisma.leave.findMany({
    where,
    include: { employee: { select: { empId: true, name: true } } },
    orderBy: [{ startDate: 'desc' }],
  });

  return NextResponse.json(leaves);
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const empId = body.empId ? String(body.empId).trim() : '';
  const type = body.type ? String(body.type).toUpperCase() : '';
  const startDateStr = body.startDate ? String(body.startDate).trim() : '';
  const endDateStr = body.endDate ? String(body.endDate).trim() : '';
  const notes = body.notes != null ? String(body.notes) : null;

  if (!empId || !type || !startDateStr || !endDateStr) {
    return NextResponse.json({ error: 'empId, type, startDate, endDate required' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(type as LeaveType)) {
    return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 });
  }

  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const endDate = new Date(endDateStr + 'T00:00:00Z');
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId: scopeId } = scopeResult;

  const employee = await prisma.employee.findUnique({
    where: { empId, boutiqueId: scopeId },
  });
  if (!employee) return NextResponse.json({ error: 'Employee not found or not in your boutique' }, { status: 400 });

  const leave = await prisma.leave.create({
    data: { empId, type: type as LeaveType, startDate, endDate, notes },
    include: { employee: { select: { empId: true, name: true } } },
  });
  return NextResponse.json(leave);
}
