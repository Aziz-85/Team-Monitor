/**
 * POST /api/compliance/:id/attach/chunk — chunked upload (bypasses 4.5MB Vercel limit).
 * Each chunk must be < 4MB. Client splits file and uploads sequentially.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { COMPLIANCE_ROLES } from '@/lib/permissions';
import { writeFile, mkdir, unlink, readFile, appendFile, rmdir } from 'fs/promises';
import path from 'path';
import { existsSync, readdirSync } from 'fs';

export const maxDuration = 60;

const CHUNK_SIZE_MAX = 4 * 1024 * 1024; // 4MB per chunk (Vercel limit 4.5MB)
const MAX_TOTAL_MB = 50; // max assembled file 50MB
const ALLOWED_EXT = /\.(pdf|png|jpe?g|gif|webp|doc|docx|xls|xlsx)$/i;

function getChunkBaseDir(): string {
  if (process.env.VERCEL) return '/tmp/compliance-chunks';
  return path.join(process.cwd(), 'data/compliance-chunks');
}

function getAttachBaseDir(): string {
  if (process.env.VERCEL) return '/tmp/compliance-attachments';
  return path.join(process.cwd(), 'data/compliance-attachments');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const item = await prisma.complianceItem.findUnique({
    where: { id },
    select: { boutiqueId: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.boutiqueIds.includes(item.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const uploadId = (formData.get('uploadId') as string)?.trim();
  const chunkIndex = parseInt(String(formData.get('chunkIndex') ?? ''), 10);
  const totalChunks = parseInt(String(formData.get('totalChunks') ?? ''), 10);
  const fileName = (formData.get('fileName') as string)?.trim();
  const file = formData.get('file') ?? formData.get('chunk');

  if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName || !file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'uploadId, chunkIndex, totalChunks, fileName, file required' },
      { status: 400 }
    );
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!ALLOWED_EXT.test(safeName)) {
    return NextResponse.json({ error: 'Allowed: PDF, PNG, JPG, GIF, WebP, DOC, DOCX, XLS, XLSX' }, { status: 400 });
  }

  if (chunkIndex < 0 || chunkIndex >= totalChunks || totalChunks < 1 || totalChunks > 100) {
    return NextResponse.json({ error: 'Invalid chunk indices' }, { status: 400 });
  }

  const blob = file as File;
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.length > CHUNK_SIZE_MAX) {
    return NextResponse.json({ error: 'Chunk too large (max 4MB per chunk)' }, { status: 400 });
  }

  const chunkDir = path.join(getChunkBaseDir(), id, uploadId);
  const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);

  try {
    await mkdir(chunkDir, { recursive: true });
    await writeFile(chunkPath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[compliance-chunk] write failed:', msg);
    return NextResponse.json({ error: 'Failed to save chunk' }, { status: 500 });
  }

  const isLastChunk = chunkIndex === totalChunks - 1;
  if (!isLastChunk) {
    return NextResponse.json({ ok: true, chunkIndex, message: 'Chunk saved' });
  }

  // Last chunk: assemble all chunks and save
  const baseDir = getAttachBaseDir();
  const storagePath = `${id}/${safeName}`;
  const fullPath = path.join(baseDir, storagePath);

  try {
    await mkdir(path.join(baseDir, id), { recursive: true });
    if (existsSync(fullPath)) await unlink(fullPath);
    const chunks = readdirSync(chunkDir)
      .filter((f) => f.startsWith('chunk-'))
      .sort((a, b) => {
        const ai = parseInt(a.replace('chunk-', ''), 10);
        const bi = parseInt(b.replace('chunk-', ''), 10);
        return ai - bi;
      });

    if (chunks.length !== totalChunks) {
      return NextResponse.json(
        { error: `Missing chunks: got ${chunks.length}, expected ${totalChunks}` },
        { status: 400 }
      );
    }

    let totalSize = 0;
    for (const c of chunks) {
      const p = path.join(chunkDir, c);
      const buf = await readFile(p);
      totalSize += buf.length;
      if (totalSize > MAX_TOTAL_MB * 1024 * 1024) {
        return NextResponse.json({ error: `File too large (max ${MAX_TOTAL_MB}MB)` }, { status: 400 });
      }
      await appendFile(fullPath, buf);
    }

    // Cleanup chunks
    for (const c of chunks) {
      try {
        await unlink(path.join(chunkDir, c));
      } catch {
        // ignore
      }
    }
try {
        if (readdirSync(chunkDir).length === 0) {
          await rmdir(chunkDir);
        }
      } catch {
        // ignore
      }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[compliance-chunk] assemble failed:', msg);
    return NextResponse.json({ error: 'Failed to assemble file' }, { status: 500 });
  }

  // Remove old attachment if different
  const existing = await prisma.complianceItem.findUnique({
    where: { id },
    select: { attachmentStoragePath: true },
  });
  if (existing?.attachmentStoragePath && existing.attachmentStoragePath !== storagePath) {
    const oldPath = path.join(getAttachBaseDir(), existing.attachmentStoragePath);
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
    data: { attachmentFileName: safeName, attachmentStoragePath: storagePath },
  });

  return NextResponse.json({
    ok: true,
    fileName: safeName,
    message: 'Attachment uploaded',
  });
}
