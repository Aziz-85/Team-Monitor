import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';

/** PUT: update a release note. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { version?: string; title?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = await prisma.releaseNote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Release note not found' }, { status: 404 });

  const version = body.version !== undefined ? String(body.version).trim() : existing.version;
  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  const notes = body.notes !== undefined ? String(body.notes) : existing.notes;

  if (!version || !title) {
    return NextResponse.json({ error: 'version and title required' }, { status: 400 });
  }

  if (version !== existing.version) {
    const duplicate = await prisma.releaseNote.findUnique({ where: { version } });
    if (duplicate) {
      return NextResponse.json({ error: 'Another release note with this version exists' }, { status: 400 });
    }
  }

  const updated = await prisma.releaseNote.update({
    where: { id },
    data: { version, title, notes },
  });

  return NextResponse.json(updated);
}

/** DELETE: remove a release note. */
export async function DELETE(
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

  await prisma.releaseNote.delete({ where: { id } }).catch(() => {
    throw new Error('Not found');
  });

  return NextResponse.json({ ok: true });
}
