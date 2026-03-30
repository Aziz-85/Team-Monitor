import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { requireRole } from '@/lib/auth';
import type { PlannerTaskFrequency } from '@prisma/client';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

function parseType(v: string | null): PlannerTaskFrequency | null {
  if (!v) return null;
  const t = v.trim().toUpperCase();
  if (t === 'DAILY' || t === 'WEEKLY' || t === 'MONTHLY') return t as PlannerTaskFrequency;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    return handleAdminError(e);
  }

  const dateFrom = request.nextUrl.searchParams.get('dateFrom')?.trim() || null;
  const dateTo = request.nextUrl.searchParams.get('dateTo')?.trim() || null;
  const type = parseType(request.nextUrl.searchParams.get('type'));
  const branchCode = request.nextUrl.searchParams.get('branchCode')?.trim() || null;
  const userId = request.nextUrl.searchParams.get('userId')?.trim() || null;
  const limit = Math.min(500, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10)));

  const where = {
    ...(dateFrom || dateTo
      ? {
          completedOnDateKey: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(type ? { taskType: type } : {}),
    ...(branchCode ? { branchCode } : {}),
    ...(userId ? { completedByUserId: userId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.plannerTaskCompletion.findMany({
      where,
      orderBy: [{ completedOnDateKey: 'desc' }, { completedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        boutiqueId: true,
        internalTaskKey: true,
        taskType: true,
        branchCode: true,
        plannerTaskId: true,
        plannerTaskTitle: true,
        completedByUserId: true,
        completedByName: true,
        completedByEmail: true,
        completedOnDateKey: true,
        completedAt: true,
        source: true,
        createdAt: true,
        completedByUser: { select: { id: true, empId: true, employee: { select: { name: true } } } },
      },
    }),
    prisma.plannerTaskCompletion.count({ where }),
  ]);

  return NextResponse.json({ total, rows });
}

