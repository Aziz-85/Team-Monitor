import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import type { Role } from '@prisma/client';

export async function POST() {
  try {
    await requireRole(['ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    message: 'Import not implemented in v1. Stub only.',
    ok: false,
  });
}
