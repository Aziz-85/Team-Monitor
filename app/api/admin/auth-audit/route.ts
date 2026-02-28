import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

const EVENT_TYPES = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'LOGIN_RATE_LIMITED',
  'ACCOUNT_LOCKED',
  'SECURITY_ALERT',
] as const;
const DATE_REG = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.min(1000, Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1));
  const pageSize = Math.min(200, Math.max(1, parseInt(params.get('pageSize') ?? '20', 10) || 20));
  const eventParam = params.get('event')?.toUpperCase();
  const event = eventParam && EVENT_TYPES.includes(eventParam as (typeof EVENT_TYPES)[number]) ? eventParam : null;
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const quickFilter = params.get('quick') ?? '';

  const where: {
    event?: string;
    createdAt?: { gte: Date; lte: Date };
    ip?: string;
    OR?: Array<{ emailAttempted?: { contains: string; mode: 'insensitive' }; user?: { employee?: { email?: { contains: string; mode: 'insensitive' } } } }>;
  } = {};

  if (quickFilter === 'last24h_failed') {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    where.event = 'LOGIN_FAILED';
    where.createdAt = { gte: dayAgo, lte: now };
  } else if (quickFilter === 'rate_limited') {
    where.event = 'LOGIN_RATE_LIMITED';
  } else if (quickFilter === 'security_alert') {
    where.event = 'SECURITY_ALERT';
  } else {
    if (event) where.event = event;
  }

  if (from && to && DATE_REG.test(from) && DATE_REG.test(to) && !quickFilter) {
    const fromDate = new Date(from + 'T00:00:00.000Z');
    const toDate = new Date(to + 'T23:59:59.999Z');
    if (fromDate <= toDate) {
      where.createdAt = { gte: fromDate, lte: toDate };
    }
  }

  if (q) {
    where.OR = [
      { emailAttempted: { contains: q, mode: 'insensitive' } },
      { user: { employee: { email: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const includeTopEmails = params.get('include') === 'top_emails';

  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [list, total, topAttempted] = await Promise.all([
      prisma.authAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              empId: true,
              employee: { select: { name: true, email: true } },
            },
          },
        },
      }),
      prisma.authAuditLog.count({ where }),
      includeTopEmails
        ? prisma.authAuditLog.groupBy({
            by: ['emailAttempted'],
            where: {
              event: 'LOGIN_FAILED',
              createdAt: { gte: dayAgo },
              emailAttempted: { not: null },
            },
            _count: { emailAttempted: true },
            orderBy: { _count: { emailAttempted: 'desc' } },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    const rows = list.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      event: r.event,
      userId: r.userId,
      userEmpId: r.user?.empId ?? null,
      userName: r.user?.employee?.name ?? null,
      userEmail: r.user?.employee?.email ?? null,
      emailAttempted: r.emailAttempted,
      ip: r.ip,
      userAgent: r.userAgent,
      deviceHint: r.deviceHint,
      reason: r.reason,
    }));

    const payload: { list: typeof rows; total: number; topAttemptedEmails?: Array<{ emailAttempted: string | null; count: number }> } = {
      list: rows,
      total,
    };
    if (includeTopEmails) {
      payload.topAttemptedEmails = topAttempted.map((x) => ({
        emailAttempted: x.emailAttempted,
        count: x._count.emailAttempted,
      }));
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load audit log', list: [], total: 0 },
      { status: 500 }
    );
  }
}
