import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';

const RELATIVE_PATH = 'public/zones/dhahran-zones-map.png';
const ALLOWED_TYPES = ['image/png'];

/** POST: Admin only. Upload zones map image (PNG) to public/zones/dhahran-zones-map.png */
export async function POST(request: NextRequest) {
  try {
    await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400 }
    );
  }

  const file = formData.get('file') ?? formData.get('image');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'No file provided. Use field name "file" or "image".' },
      { status: 400 }
    );
  }

  const blob = file as Blob;
  const type = blob.type?.toLowerCase() ?? '';
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: 'Only PNG images are allowed (image/png).' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const dir = path.join(process.cwd(), 'public', 'zones');
  const filePath = path.join(process.cwd(), RELATIVE_PATH);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upload-map] write failed:', msg);
    return NextResponse.json(
      { error: 'Failed to save file. Check server logs.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    path: '/zones/dhahran-zones-map.png',
    message: 'Map image updated.',
  });
}

/** DELETE: Admin only. Remove zones map image file. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(_request: NextRequest) {
  try {
    await requireRole(['ADMIN']);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filePath = path.join(process.cwd(), RELATIVE_PATH);
  try {
    await unlink(filePath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ ok: true, message: 'Map image was not present.' });
    }
    console.error('[upload-map] DELETE unlink failed:', err?.message ?? e);
    return NextResponse.json(
      { error: 'Failed to delete file. Check server logs.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, message: 'Map image deleted.' });
}
