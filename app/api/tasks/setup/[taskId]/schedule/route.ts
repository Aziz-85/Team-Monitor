import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import type { TaskScheduleType } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { taskId } = await params;
  const body = await request.json();
  const type = String(body.type ?? 'DAILY').toUpperCase() as TaskScheduleType;
  const weeklyDays = Array.isArray(body.weeklyDays) ? body.weeklyDays.map(Number) : [];
  const monthlyDay = body.monthlyDay != null ? Number(body.monthlyDay) : null;
  const isLastDay = Boolean(body.isLastDay);

  const schedule = await prisma.taskSchedule.create({
    data: {
      taskId,
      type,
      weeklyDays: type === 'WEEKLY' ? weeklyDays : [],
      monthlyDay: type === 'MONTHLY' ? monthlyDay : null,
      isLastDay: type === 'MONTHLY' ? isLastDay : false,
    },
  });
  return NextResponse.json(schedule);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await params;
    const body = await request.json();
    const scheduleId = body.id ?? body.scheduleId;
    if (!scheduleId) return NextResponse.json({ error: 'id or scheduleId required' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (body.type !== undefined) update.type = body.type;
    if (body.weeklyDays !== undefined) update.weeklyDays = body.weeklyDays;
    if (body.monthlyDay !== undefined) update.monthlyDay = body.monthlyDay;
    if (body.isLastDay !== undefined) update.isLastDay = body.isLastDay;

    const schedule = await prisma.taskSchedule.update({
      where: { id: scheduleId },
      data: update,
    });
    return NextResponse.json(schedule);
  } catch (err) {
    console.error('/api/tasks/setup/[taskId]/schedule PATCH error:', err);
    return NextResponse.json(
      { error: 'Server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
