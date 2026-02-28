import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';

const PAGE_SIZE = 20;

/** GET: list deploy records with pagination and optional filter by environment. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const environment = searchParams.get('environment')?.trim() || undefined;
  const skip = (page - 1) * PAGE_SIZE;

  const where = environment ? { environment } : {};

  const [items, total] = await Promise.all([
    prisma.deployRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        deployedByUser: { select: { empId: true, employee: { select: { name: true } } } },
      },
    }),
    prisma.deployRecord.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((d) => ({
      id: d.id,
      createdAt: d.createdAt.toISOString(),
      appVersion: d.appVersion,
      gitHash: d.gitHash,
      buildDate: d.buildDate.toISOString(),
      environment: d.environment,
      serverHost: d.serverHost,
      serverIp: d.serverIp,
      deployedByUserId: d.deployedByUserId,
      deployedByName: d.deployedByUser?.employee?.name ?? d.deployedByUser?.empId ?? null,
      deploySource: d.deploySource,
      notes: d.notes,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
