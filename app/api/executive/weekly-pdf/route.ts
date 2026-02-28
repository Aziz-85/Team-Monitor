/**
 * Weekly Executive PDF — READ ONLY aggregation. MANAGER + ADMIN only.
 * Scope resolved server-side; data filtered by boutiqueIds.
 * Query: weekStart (YYYY-MM-DD, Saturday).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { tasksRunnableOnDate, assignTaskOnDate } from '@/lib/services/tasks';
import { calculateBoutiqueScore } from '@/lib/executive/score';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { Role } from '@prisma/client';

const BURST_WINDOW_MS = 3 * 60 * 1000;
const BURST_MIN_TASKS = 4;
const GOLD = rgb(0.78, 0.65, 0.34);

function getWeekDates(weekStart: string): string[] {
  const d = new Date(weekStart + 'T12:00:00Z');
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function countBursts(completions: { userId: string; completedAt: Date }[]): {
  count: number;
  byUser: Map<string, number>;
} {
  const byUser = new Map<string, { completedAt: Date }[]>();
  for (const c of completions) {
    let list = byUser.get(c.userId);
    if (!list) {
      list = [];
      byUser.set(c.userId, list);
    }
    list.push({ completedAt: c.completedAt });
  }
  let totalBursts = 0;
  const burstCountByUser = new Map<string, number>();
  for (const [userId, list] of Array.from(byUser.entries())) {
    list.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    let userBursts = 0;
    for (let i = 0; i < list.length; i++) {
      const t0 = list[i].completedAt.getTime();
      const inWindow = list.filter(
        (t) =>
          t.completedAt.getTime() >= t0 &&
          t.completedAt.getTime() <= t0 + BURST_WINDOW_MS
      );
      if (inWindow.length >= BURST_MIN_TASKS) userBursts++;
    }
    if (userBursts > 0) {
      totalBursts += userBursts;
      burstCountByUser.set(userId, userBursts);
    }
  }
  return { count: totalBursts, byUser: burstCountByUser };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await resolveScopeForUser(user.id, role, null);
  const boutiqueIds = scope.boutiqueIds;
  if (boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No boutiques in scope' }, { status: 403 });
  }

  const boutiqueFilter = { boutiqueId: { in: boutiqueIds } };
  const zoneIdsResult = await prisma.inventoryZone.findMany({
    where: { boutiqueId: { in: boutiqueIds } },
    select: { id: true },
  });
  const zoneIds = zoneIdsResult.map((z) => z.id);

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: 'Invalid weekStart; use YYYY-MM-DD (Saturday)' },
      { status: 400 }
    );
  }

  const weekDates = getWeekDates(weekStart);
  const rangeStart = new Date(weekDates[0] + 'T00:00:00Z');
  const rangeEnd = new Date(weekDates[6] + 'T23:59:59.999Z');
  const monthKey = weekStart.slice(0, 7);

  const [
    boutiqueTarget,
    salesSum,
    tasks,
    completionsInWeek,
    zoneRuns,
    allUsers,
    zones,
  ] = await Promise.all([
    prisma.boutiqueMonthlyTarget.findFirst({
      where: { month: monthKey, ...boutiqueFilter },
    }),
    prisma.salesEntry.aggregate({
      where: { month: monthKey, ...boutiqueFilter },
      _sum: { amount: true },
    }),
    prisma.task.findMany({
      where: { active: true, ...boutiqueFilter },
      include: {
        taskSchedules: true,
        taskPlans: {
          include: {
            primary: { select: { empId: true, name: true } },
            backup1: { select: { empId: true, name: true } },
            backup2: { select: { empId: true, name: true } },
          },
        },
      },
    }),
    prisma.taskCompletion.findMany({
      where: {
        undoneAt: null,
        completedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { taskId: true, userId: true, completedAt: true },
    }),
    zoneIds.length > 0
      ? prisma.inventoryWeeklyZoneRun.findMany({
          where: {
            weekStart: new Date(weekStart + 'T00:00:00Z'),
            zoneId: { in: zoneIds },
          },
          select: { zoneId: true, status: true, completedAt: true },
        })
      : [],
    prisma.user.findMany({
      where: { disabled: false },
      select: { id: true, empId: true, employee: { select: { name: true } } },
    }),
    zoneIds.length > 0
      ? prisma.inventoryZone.findMany({
          where: { id: { in: zoneIds } },
          select: { id: true, code: true },
        })
      : [],
  ]);

  const empIdToUserId = new Map(allUsers.map((u) => [u.empId, u.id]));
  const userIdToName = new Map(
    allUsers.map((u) => [u.id, u.employee?.name ?? u.empId])
  );

  const revenue = salesSum._sum.amount ?? 0;
  const target = boutiqueTarget?.amount ?? 0;
  const achievementPct = target > 0 ? Math.round((revenue / target) * 100) : 0;

  let totalWeekly = 0;
  let completed = 0;
  let overdue = 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const dateStr of weekDates) {
    const date = new Date(dateStr + 'T00:00:00Z');
    const isPast = dateStr < todayStr;
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const a = await assignTaskOnDate(task, date);
      totalWeekly++;
      const assignedUserId = a.assignedEmpId ? empIdToUserId.get(a.assignedEmpId) : null;
      const comp = completionsInWeek.find(
        (c) =>
          c.taskId === task.id &&
          (assignedUserId ? c.userId === assignedUserId : false)
      );
      if (comp) completed++;
      else if (isPast) overdue++;
    }
  }
  void completed; // count kept for potential future use in PDF
  const overduePct = totalWeekly > 0 ? Math.round((overdue / totalWeekly) * 100) : 0;
  const burstResult = countBursts(
    completionsInWeek.map((c) => ({ userId: c.userId, completedAt: c.completedAt }))
  );
  const suspiciousPct =
    totalWeekly > 0 ? Math.round((burstResult.count / totalWeekly) * 100) : 0;

  const top3ByCompletions = new Map<string, number>();
  for (const c of completionsInWeek) {
    top3ByCompletions.set(c.userId, (top3ByCompletions.get(c.userId) ?? 0) + 1);
  }
  const top3 = Array.from(top3ByCompletions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([uid]) => ({ name: userIdToName.get(uid) ?? uid }));

  const zoneCodeById = new Map(zones.map((z) => [z.id, z.code]));
  const zoneByCode = new Map<string, { done: number; total: number }>();
  for (const r of zoneRuns) {
    const code = zoneCodeById.get(r.zoneId) ?? r.zoneId;
    if (!zoneByCode.has(code)) zoneByCode.set(code, { done: 0, total: 0 });
    const z = zoneByCode.get(code)!;
    z.total++;
    if (r.status === 'COMPLETED' || r.completedAt != null) z.done++;
  }
  const zoneCompliance = Array.from(zoneByCode.entries())
    .map(([zone, v]) => `${zone}: ${v.total > 0 ? Math.round((v.done / v.total) * 100) : 0}%`)
    .sort()
    .join(', ');

  let boutiqueScore: { score: number; classification: string } = {
    score: 0,
    classification: '—',
  };
  try {
    const scoreResult = await calculateBoutiqueScore(monthKey, boutiqueIds);
    boutiqueScore = { score: scoreResult.score, classification: scoreResult.classification };
  } catch {
    // leave default
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  page.drawRectangle({
    x: 0,
    y: height - 42,
    width,
    height: 42,
    color: GOLD,
  });
  page.drawText('Weekly Executive Report', {
    x: margin,
    y: height - 30,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`Week: ${weekStart}`, {
    x: margin,
    y: height - 48,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y = height - 70;

  const line = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: margin + 220, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= 18;
  };

  line('Sales (SAR) (month)', String(revenue.toLocaleString()));
  line('Target (month)', String(target.toLocaleString()));
  line('Achievement', `${achievementPct}%`);
  line('Overdue %', `${overduePct}%`);
  line('Suspicious %', `${suspiciousPct}%`);
  line('Boutique Score', `${boutiqueScore.score} (${boutiqueScore.classification})`);
  y -= 8;
  page.drawText('Top 3 performers', { x: margin, y, size: 11, font: fontBold, color: GOLD });
  y -= 16;
  top3.forEach((p, i) => {
    page.drawText(`${i + 1}. ${p.name}`, { x: margin + 10, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 16;
  });
  y -= 8;
  page.drawText('Zone compliance', { x: margin, y, size: 11, font: fontBold, color: GOLD });
  y -= 16;
  page.drawText(zoneCompliance || '—', { x: margin + 10, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });

  page.drawText('Team Monitor – Confidential', {
    x: margin,
    y: 28,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(new Blob([pdfBytes as BlobPart]), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="executive-weekly-${weekStart}.pdf"`,
    },
  });
}
