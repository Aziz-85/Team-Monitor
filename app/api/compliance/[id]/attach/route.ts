/**
 * GET /api/compliance/:id/attach — download/view attachment (RBAC + scope).
 * POST /api/compliance/:id/attach — upload attachment (RBAC + scope).
 * DELETE /api/compliance/:id/attach — remove attachment (RBAC + scope).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { COMPLIANCE_ROLES } from '@/lib/permissions';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const BASE_DIR = 'data/compliance-attachments';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = /\.(pdf|png|jpe?g|gif|webp|doc|docx|xls|xlsx)$/i;
const ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

async function checkScopeAndItem(
  request: NextRequest,
  id: string
): Promise<{ item: { id: string; boutiqueId: string; attachmentFileName: string | null; attachmentStoragePath: string | null } } | NextResponse> {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const item = await prisma.complianceItem.findUnique({
    where: { id },
    select: { id: true, boutiqueId: true, attachmentFileName: true, attachmentStoragePath: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.boutiqueIds.includes(item.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { item };
}

/** GET: Download attachment. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await checkScopeAndItem(request, id);
  if (result instanceof NextResponse) return result;
  const { item } = result;

  if (!item.attachmentStoragePath || !item.attachmentFileName) {
    return NextResponse.json({ error: 'No attachment' }, { status: 404 });
  }

  const fullPath = path.join(process.cwd(), BASE_DIR, item.attachmentStoragePath);
  if (!existsSync(fullPath)) {
    await prisma.complianceItem.update({
      where: { id },
      data: { attachmentFileName: null, attachmentStoragePath: null },
    });
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = await readFile(fullPath);
  const ext = path.extname(item.attachmentFileName).toLowerCase();
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === '1';
  const disposition = forceDownload
    ? `attachment; filename="${item.attachmentFileName.replace(/"/g, '\\"')}"`
    : `inline; filename="${item.attachmentFileName.replace(/"/g, '\\"')}"`;
  const contentType =
    ext === '.pdf' ? 'application/pdf' :
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.gif' ? 'image/gif' :
    ext === '.webp' ? 'image/webp' :
    'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
    },
  });
}

/** POST: Upload attachment. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await checkScopeAndItem(request, id);
  if (result instanceof NextResponse) return result;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') ?? formData.get('attachment');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file. Use field "file" or "attachment".' }, { status: 400 });
  }

  const blob = file as File;
  const fileName = (blob.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!ALLOWED_EXT.test(fileName)) {
    return NextResponse.json(
      { error: 'Allowed: PDF, PNG, JPG, GIF, WebP, DOC, DOCX, XLS, XLSX' },
      { status: 400 }
    );
  }

  const mime = blob.type?.toLowerCase() ?? '';
  if (mime && !ALLOWED_MIMES.includes(mime)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.length > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const storagePath = `${id}/${fileName}`;
  const dir = path.join(process.cwd(), BASE_DIR, id);
  const fullPath = path.join(process.cwd(), BASE_DIR, storagePath);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[compliance-attach] write failed:', msg);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }

  // Remove old file if different path
  const existing = await prisma.complianceItem.findUnique({
    where: { id },
    select: { attachmentStoragePath: true },
  });
  if (existing?.attachmentStoragePath && existing.attachmentStoragePath !== storagePath) {
    const oldPath = path.join(process.cwd(), BASE_DIR, existing.attachmentStoragePath);
    if (existsSync(oldPath)) {
      try {
        await unlink(oldPath);
      } catch {
        // ignore
      }
    }
  }

  await prisma.complianceItem.update({
    where: { id },
    data: { attachmentFileName: fileName, attachmentStoragePath: storagePath },
  });

  return NextResponse.json({
    ok: true,
    fileName,
    message: 'Attachment uploaded',
  });
}

/** DELETE: Remove attachment. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await checkScopeAndItem(request, id);
  if (result instanceof NextResponse) return result;
  const { item } = result;

  if (!item.attachmentStoragePath) {
    return NextResponse.json({ ok: true, message: 'No attachment' });
  }

  const fullPath = path.join(process.cwd(), BASE_DIR, item.attachmentStoragePath);
  if (existsSync(fullPath)) {
    try {
      await unlink(fullPath);
    } catch (e) {
      console.error('[compliance-attach] delete failed:', e);
    }
  }

  await prisma.complianceItem.update({
    where: { id },
    data: { attachmentFileName: null, attachmentStoragePath: null },
  });

  return NextResponse.json({ ok: true, message: 'Attachment removed' });
}
