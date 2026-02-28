import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';

const PAGE_SIZE = 20;

/** GET: list release notes with pagination and optional search (version / title). */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const search = (searchParams.get('search') ?? '').trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where = search
    ? {
        OR: [
          { version: { contains: search, mode: 'insensitive' as const } },
          { title: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.releaseNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        createdByUser: { select: { empId: true, employee: { select: { name: true } } } },
      },
    }),
    prisma.releaseNote.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      createdByUserId: r.createdByUserId,
      createdByName: r.createdByUser?.employee?.name ?? r.createdByUser?.empId ?? null,
      isPublished: r.isPublished,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}

/** POST: create a release note. */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  let body: { version?: string; title?: string; notes?: string; isPublished?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const version = (body.version ?? '').trim();
  const title = (body.title ?? '').trim();
  const notes = (body.notes ?? '').trim();
  const isPublished = body.isPublished === true;

  if (!version || !title) {
    return NextResponse.json({ error: 'version and title required' }, { status: 400 });
  }

  const existing = await prisma.releaseNote.findUnique({ where: { version } });
  if (existing) {
    return NextResponse.json({ error: 'Release note with this version already exists' }, { status: 400 });
  }

  const created = await prisma.releaseNote.create({
    data: {
      version,
      title,
      notes,
      isPublished,
      createdByUserId: user.id,
    },
  });

  return NextResponse.json(created);
}
