import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';

/** POST: toggle isPublished for a release note. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await prisma.releaseNote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Release note not found' }, { status: 404 });

  const updated = await prisma.releaseNote.update({
    where: { id },
    data: { isPublished: !existing.isPublished },
  });

  return NextResponse.json(updated);
}
