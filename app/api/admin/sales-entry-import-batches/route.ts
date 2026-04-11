/**
 * List recent canonical SalesEntry import batches (audit / rollback entry point).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

export async function GET() {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batches = await prisma.salesEntryImportBatch.findMany({
    take: 50,
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      source: true,
      fileName: true,
      fileSha256: true,
      uploadedAt: true,
      uploadedById: true,
      monthKey: true,
      importMode: true,
      status: true,
      _count: { select: { lines: true } },
    },
  });

  return NextResponse.json({ batches });
}
