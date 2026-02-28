/**
 * POST /api/admin/month-snapshot/upload
 * ADMIN only. Multipart: branchCode, month (YYYY-MM), file (.xlsx only).
 * XLSX only; backup on overwrite; audit log; atomic write.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, rename } from 'fs/promises';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';
import { requireRole } from '@/lib/auth';
import { AuthError } from '@/lib/auth';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { prisma } from '@/lib/db';
import { validateMonthSnapshotExcel } from '@/lib/snapshots/validateMonthSnapshotExcel';
import { loadMonthSnapshotFromExcel } from '@/lib/snapshots/loadMonthSnapshotFromExcel';

export const dynamic = 'force-dynamic';

const DEFAULT_MONTH_SNAPSHOT_DIR = '/data/month-snapshots';

function getBaseDir(): string {
  return (process.env.MONTH_SNAPSHOT_DIR ?? DEFAULT_MONTH_SNAPSHOT_DIR).replace(/\/+$/, '');
}

function safeBranchCode(code: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return null;
  return code;
}

function backupTimestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day}T${hh}-${mm}-${ss}`;
}

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    const user = await requireRole(['ADMIN', 'SUPER_ADMIN']);
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw e;
  }

  let branchCode = '';
  let month = '';
  let fileBuffer: Buffer | null = null;

  try {
    const formData = await request.formData();
    branchCode = (formData.get('branchCode') as string)?.trim() ?? '';
    month = (formData.get('month') as string)?.trim() ?? '';
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    const name = (file as File).name ?? '';
    const nameLower = name.toLowerCase();
    if (nameLower.endsWith('.xlsm')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'XLSX_ONLY',
          message: 'Only .xlsx is allowed. Macros (.xlsm) are not permitted.',
        },
        { status: 415 }
      );
    }
    if (!nameLower.endsWith('.xlsx')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'XLSX_ONLY',
          message: 'Only .xlsx is allowed. Macros (.xlsm) are not permitted.',
        },
        { status: 415 }
      );
    }
    const ab = await file.arrayBuffer();
    fileBuffer = Buffer.from(ab);
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const safeBranch = safeBranchCode(branchCode);
  if (!safeBranch) {
    return NextResponse.json({ error: 'Invalid branchCode (only letters, numbers, _, - allowed)' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month (use YYYY-MM)' }, { status: 400 });
  }
  if (!fileBuffer || fileBuffer.length === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }

  const validation = validateMonthSnapshotExcel(fileBuffer, month);
  if (!validation.valid) {
    return NextResponse.json(
      { ok: false, errors: validation.errors },
      { status: 422 }
    );
  }

  const baseDir = getBaseDir();
  const dir = path.join(baseDir, safeBranch);
  await mkdir(dir, { recursive: true });
  const fileName = `${month}.xlsx`;
  const targetPath = path.join(dir, fileName);
  const existsBefore = existsSync(targetPath);
  let backedUp = false;
  let backupName: string | undefined;

  if (existsBefore) {
    backupName = `${month}__backup_${backupTimestamp()}.xlsx`;
    const backupPath = path.join(dir, backupName);
    copyFileSync(targetPath, backupPath);
    backedUp = true;
  }

  const tempPath = path.join(dir, `${fileName}.tmp.${Date.now()}`);
  await writeFile(tempPath, fileBuffer);
  await rename(tempPath, targetPath);

  const pathRelative = `month-snapshots/${safeBranch}/${fileName}`;
  const uploadedAt = new Date();
  const uploadedAtIso = uploadedAt.toISOString();

  let dailyRows = 0;
  let staffRows = 0;
  let preview: { mtdSalesSar: number; mtdInvoices: number; mtdPieces: number; staffCount: number } | undefined;
  try {
    const snapshot = await loadMonthSnapshotFromExcel({ branchCode: safeBranch, month });
    if (snapshot) {
      dailyRows = snapshot.daily.length;
      staffRows = snapshot.staff.length;
      const mtdSalesHalalas = snapshot.daily.reduce((s, d) => s + d.netSalesHalalas, 0);
      preview = {
        mtdSalesSar: Math.round(mtdSalesHalalas / 100),
        mtdInvoices: snapshot.daily.reduce((s, d) => s + d.invoices, 0),
        mtdPieces: snapshot.daily.reduce((s, d) => s + d.pieces, 0),
        staffCount: snapshot.staff.length,
      };
    }
  } catch {
    preview = undefined;
  }

  const client = getRequestClientInfo(request.headers);
  try {
    await prisma.authAuditLog.create({
      data: {
        event: 'MONTH_SNAPSHOT_UPLOAD',
        userId: userId ?? null,
        ip: client.ip ?? null,
        userAgent: client.userAgent ?? null,
        deviceHint: client.deviceHint ?? null,
        metadata: {
          branchCode: safeBranch,
          month,
          filename: fileName,
          fileSize: fileBuffer.length,
          dailyRows,
          staffRows,
          backedUp,
          backupName: backupName ?? undefined,
        },
      },
    });
  } catch (auditErr) {
    console.error('[month-snapshot upload] AuthAuditLog write failed', auditErr);
  }

  return NextResponse.json({
    ok: true,
    branchCode: safeBranch,
    month,
    existsBefore,
    backedUp,
    backupName,
    savedAs: fileName,
    uploadedAtIso,
    pathRelative,
    preview,
  });
}
