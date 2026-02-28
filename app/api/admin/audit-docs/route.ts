/**
 * GET /api/admin/audit-docs — list audit docs (ADMIN only).
 * GET /api/admin/audit-docs?file=NEXT_PLAN.md — return raw content of one doc.
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getSessionUser } from '@/lib/auth';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DOCS_AUDIT = 'docs/audit';
const ALLOWED_EXT = ['.md', '.json'];

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fileParam = request.nextUrl.searchParams.get('file');
  const basePath = join(process.cwd(), DOCS_AUDIT);

  try {
    if (fileParam) {
      const name = fileParam.replace(/[^a-zA-Z0-9_.-]/g, '');
      if (!name.endsWith('.md') && !name.endsWith('.json')) {
        return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
      }
      const content = readFileSync(join(basePath, name), 'utf-8');
      return NextResponse.json({ name, content });
    }

    const entries = readdirSync(basePath, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && ALLOWED_EXT.some((ext) => e.name.endsWith(ext)))
      .map((e) => e.name)
      .sort();
    const list = files.map((f) => ({
      name: f,
      description: f.replace(/\.(md|json)$/, '').replace(/_/g, ' '),
    }));
    return NextResponse.json({ docs: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) return NextResponse.json({ error: 'Docs folder not found' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
