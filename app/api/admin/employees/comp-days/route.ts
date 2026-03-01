/**
 * Admin: Comp Day ledger + balance. "Use Comp Day" = FORCE_OFF + DEBIT (if balance > 0).
 * GET: ledger for employee(s). Query: boutiqueId=, employeeId= (optional)
 *       Returns { ledger: [...], balanceByEmployee: { [empId]: number } }
 * POST: create DEBIT (Use Comp Day) or manual CREDIT/DEBIT.
 *       Body: { employeeId, date: "YYYY-MM-DD", action: "USE_COMP_DAY" | "CREDIT" | "DEBIT", note?, units? }
 *       USE_COMP_DAY: creates FORCE_OFF override + DEBIT(1). Fails if balance <= 0.
 *       CREDIT/DEBIT: manual ledger entry (units default 1). DEBIT fails if balance would go negative.
 * RBAC: ADMIN, SUPER_ADMIN. Boutique-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import { compDayBalanceForBoutique } from '@/lib/schedule/dayOverride';
import type { Role } from '@prisma/client';
import type { CompDayType } from '@prisma/client';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

async function requireAdminScope(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    throw { code: 'UNAUTHORIZED' as const };
  }
  const role = user.role as Role;
  if (!ADMIN_ROLES.includes(role)) {
    throw { code: 'FORBIDDEN' as const };
  }
  const scope = await getScheduleScope(request);
  if (!scope || !scope.boutiqueId || scope.boutiqueIds.length === 0) {
    return NextResponse.json(
      { error: 'Select a boutique in the scope selector.' },
      { status: 403 }
    );
  }
  return { user, scope };
}

const YMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).slice(0, 10));

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() || scope.boutiqueId;
    const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();

    if (boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
    }

    const where: { boutiqueId: string; employeeId?: string } = { boutiqueId };
    if (employeeId) where.employeeId = employeeId;

    const ledger = await prisma.compDayLedger.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, employeeId: true, date: true, type: true, units: true, note: true, createdAt: true },
    });

    const empIds = Array.from(new Set(ledger.map((r) => r.employeeId)));
    const balanceByEmployee: Record<string, number> = {};
    for (const eid of empIds) {
      balanceByEmployee[eid] = await compDayBalanceForBoutique(boutiqueId, eid);
    }

    return NextResponse.json({ ledger, balanceByEmployee });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminScope(request);
    if (result instanceof NextResponse) return result;
    const { scope } = result;
    const body = await request.json().catch(() => ({}));
    const boutiqueId = (typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '') || scope.boutiqueId;
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    const date = typeof body.date === 'string' ? String(body.date).slice(0, 10) : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const note = typeof body.note === 'string' ? body.note.trim() : null;
    const units = typeof body.units === 'number' ? Math.max(1, Math.floor(body.units)) : 1;

    if (boutiqueId !== scope.boutiqueId) {
      return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
    }
    if (!YMD(date) || !employeeId) {
      return NextResponse.json(
        { error: 'Body must include employeeId and date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const emp = await prisma.employee.findFirst({
      where: { empId: employeeId, boutiqueId, active: true },
      select: { empId: true },
    });
    if (!emp) {
      return NextResponse.json({ error: 'Employee not found or not in this boutique' }, { status: 404 });
    }

    if (action === 'USE_COMP_DAY') {
      const balance = await compDayBalanceForBoutique(boutiqueId, employeeId);
      if (balance <= 0) {
        return NextResponse.json(
          { error: 'Insufficient comp day balance. Cannot use comp day.' },
          { status: 400 }
        );
      }
      await prisma.employeeDayOverride.upsert({
        where: {
          boutiqueId_employeeId_date: { boutiqueId, employeeId, date },
        },
        create: { boutiqueId, employeeId, date, mode: 'FORCE_OFF', reason: note ?? 'Comp Day' },
        update: { mode: 'FORCE_OFF', reason: note ?? 'Comp Day' },
      });
      const ledger = await prisma.compDayLedger.create({
        data: {
          boutiqueId,
          employeeId,
          date,
          type: 'DEBIT',
          units: 1,
          note: note ?? 'Comp day used',
        },
        select: { id: true, employeeId: true, date: true, type: true, units: true, note: true, createdAt: true },
      });
      const newBalance = await compDayBalanceForBoutique(boutiqueId, employeeId);
      return NextResponse.json({ override: 'FORCE_OFF', ledger, balance: newBalance });
    }

    if (action === 'CREDIT' || action === 'DEBIT') {
      const type: CompDayType = action === 'CREDIT' ? 'CREDIT' : 'DEBIT';
      if (type === 'DEBIT') {
        const balance = await compDayBalanceForBoutique(boutiqueId, employeeId);
        if (balance < units) {
          return NextResponse.json(
            { error: `Insufficient comp day balance (${balance}). Cannot debit ${units}.` },
            { status: 400 }
          );
        }
      }
      const ledger = await prisma.compDayLedger.create({
        data: {
          boutiqueId,
          employeeId,
          date,
          type,
          units,
          note: note ?? (type === 'CREDIT' ? 'Manual credit' : 'Manual debit'),
        },
        select: { id: true, employeeId: true, date: true, type: true, units: true, note: true, createdAt: true },
      });
      const newBalance = await compDayBalanceForBoutique(boutiqueId, employeeId);
      return NextResponse.json({ ledger, balance: newBalance });
    }

    return NextResponse.json(
      { error: 'Body must include action: USE_COMP_DAY, CREDIT, or DEBIT' },
      { status: 400 }
    );
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.code === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
}
