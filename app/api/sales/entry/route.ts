/**
 * POST /api/sales/entry — Employee daily sales entry (or manager entering for employee).
 * Body JSON: scopeId, date (YYYY-MM-DD), salesSar (Int >= 0), employeeId (optional; default current user).
 * EMPLOYEE: only for self. MANAGER/ADMIN: for any employee in same scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { buildEmployeeWhereForOperational } from '@/lib/employee/employeeQuery';
import { normalizeDateOnlyRiyadh, formatDateRiyadh } from '@/lib/time';
import { recordSalesLedgerAudit } from '@/lib/sales/audit';
import { syncDailyLedgerToSalesEntry } from '@/lib/sales/syncDailyLedgerToSalesEntry';

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'EMPLOYEE']);
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const scopeId = scopeResult.boutiqueId;

  let body: { scopeId?: string; date?: string; salesSar?: number; employeeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const dateRaw = (body.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const date = normalizeDateOnlyRiyadh(dateRaw);

  if (body.salesSar === undefined || body.salesSar === null) {
    return NextResponse.json({ error: 'salesSar is required' }, { status: 400 });
  }
  if (typeof body.salesSar !== 'number' || !Number.isInteger(body.salesSar) || body.salesSar < 0) {
    return NextResponse.json({ error: 'salesSar must be a non-negative integer' }, { status: 400 });
  }
  const salesSar = body.salesSar;

  const employeeId = ((body.employeeId ?? '').trim() || (user.empId ?? ''));
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId required (or login as user with empId)' }, { status: 400 });
  }

  if (user.role === 'EMPLOYEE') {
    if (employeeId !== (user.empId ?? '')) {
      return NextResponse.json({ error: 'Employees can only enter sales for themselves' }, { status: 403 });
    }
  } else {
    const allowed = await prisma.employee.findFirst({
      where: {
        ...buildEmployeeWhereForOperational([scopeId]),
        empId: employeeId,
      },
      select: { empId: true },
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Employee not in scope or not found' }, { status: 403 });
    }
  }

  let summary = await prisma.boutiqueSalesSummary.findUnique({
    where: { boutiqueId_date: { boutiqueId: scopeId, date } },
    include: { lines: true },
  });

  if (!summary) {
    summary = await prisma.boutiqueSalesSummary.create({
      data: {
        boutiqueId: scopeId,
        date,
        totalSar: 0,
        status: 'DRAFT',
        enteredById: user.id,
      },
      include: { lines: true },
    });
    await recordSalesLedgerAudit({
      boutiqueId: scopeId,
      date,
      actorId: user.id,
      action: 'SUMMARY_CREATE',
      reason: 'Manual entry',
    });
  }

  await prisma.boutiqueSalesLine.upsert({
    where: {
      summaryId_employeeId: { summaryId: summary.id, employeeId },
    },
    create: {
      summaryId: summary.id,
      employeeId,
      amountSar: salesSar,
      source: 'MANUAL',
    },
    update: {
      amountSar: salesSar,
      source: 'MANUAL',
      updatedAt: new Date(),
    },
  });

  await recordSalesLedgerAudit({
    boutiqueId: scopeId,
    date,
    actorId: user.id,
    action: 'LINE_UPSERT',
    metadata: { employeeId, salesSar, manualEntry: true },
  });

  const linesAfter = await prisma.boutiqueSalesLine.findMany({
    where: { summaryId: summary.id },
    select: { amountSar: true },
  });
  const totalSar = linesAfter.reduce((s, l) => s + l.amountSar, 0);
  await prisma.boutiqueSalesSummary.update({
    where: { id: summary.id },
    data: { totalSar, updatedAt: new Date() },
  });

  await syncDailyLedgerToSalesEntry({
    boutiqueId: scopeId,
    date,
    actorUserId: user.id,
  });

  return NextResponse.json({
    ok: true,
    scopeId,
    date: formatDateRiyadh(date),
    employeeId,
    salesSar,
    totalSar,
  });
}
