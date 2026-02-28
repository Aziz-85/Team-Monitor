/**
 * GET /api/admin/month-snapshot/status?branchCode=...&month=YYYY-MM
 * ADMIN only. Returns whether canonical .xlsx exists; optional uploadedAtIso, lastBackupName.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { requireRole, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_MONTH_SNAPSHOT_DIR = '/data/month-snapshots';

function getBaseDir(): string {
  return (process.env.MONTH_SNAPSHOT_DIR ?? DEFAULT_MONTH_SNAPSHOT_DIR).replace(/\/+$/, '');
}

function safeBranchCode(code: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return null;
  return code;
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPER_ADMIN']);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw e;
  }

  const branchCode = request.nextUrl.searchParams.get('branchCode')?.trim() ?? '';
  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';

  if (!safeBranchCode(branchCode)) {
    return NextResponse.json({ error: 'Invalid branchCode' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month (use YYYY-MM)' }, { status: 400 });
  }

  const baseDir = getBaseDir();
  const dir = path.join(baseDir, branchCode);
  const canonicalPath = path.join(dir, `${month}.xlsx`);
  const exists = existsSync(canonicalPath);
  const usedPath = 'month-snapshots/' + branchCode + '/' + month + '.xlsx';

  let uploadedAtIso: string | undefined;
  if (exists) {
    try {
      const st = statSync(canonicalPath);
      uploadedAtIso = st.mtime.toISOString();
    } catch {
      uploadedAtIso = undefined;
    }
  }

  let lastBackupName: string | undefined;
  if (existsSync(dir)) {
    try {
      const prefix = `${month}__backup_`;
      const suffix = '.xlsx';
      const entries = readdirSync(dir, { withFileTypes: true });
      const backups = entries.filter(
        (e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith(suffix)
      );
      if (backups.length > 0) {
        let newest: { name: string; mtime: number } | null = null;
        for (const b of backups) {
          const fp = path.join(dir, b.name);
          try {
            const st = statSync(fp);
            if (!newest || st.mtimeMs > newest.mtime) {
              newest = { name: b.name, mtime: st.mtimeMs };
            }
          } catch {
            // skip
          }
        }
        if (newest) lastBackupName = newest.name;
      }
    } catch {
      lastBackupName = undefined;
    }
  }

  return NextResponse.json({
    branchCode,
    month,
    exists,
    path: usedPath,
    uploadedAtIso,
    lastBackupName,
  });
}
