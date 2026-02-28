/**
 * POST /api/kpi/uploads — Upload KPI Excel. ADMIN + MANAGER. Multipart: file, boutiqueId, empId, periodKey.
 * GET /api/kpi/uploads — List uploads (scope-aware). Optional: boutiqueId, empId, periodKey.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseKpiExcel } from '@/lib/kpi/parseOfficialTemplate';
import { logKpiAudit } from '@/lib/kpi/audit';
import { OFFICIAL_TEMPLATE_CODE } from '@/lib/kpi/cellMap';
import type { Role } from '@prisma/client';
import { createHash } from 'crypto';

const ALLOWED_EXTENSIONS = /\.(xlsx|xlsm|xls)$/i;
const UPLOAD_ROLES: Role[] = ['ADMIN', 'MANAGER'];

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'ASSISTANT_MANAGER' && role !== 'EMPLOYEE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const empId = searchParams.get('empId') ?? undefined;
  const periodKey = searchParams.get('periodKey') ?? undefined;

  if (!user.boutiqueId) return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  const sessionBoutiqueId = user.boutiqueId;

  const where: { boutiqueId: string; empId?: string; periodKey?: string } = {
    boutiqueId: sessionBoutiqueId,
  };
  if (role === 'EMPLOYEE') {
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { empId: true } });
    if (me) where.empId = me.empId;
  } else if (empId) where.empId = empId;
  if (periodKey) where.periodKey = periodKey;

  const uploads = await prisma.kpiUpload.findMany({
    where,
    select: {
      id: true,
      boutiqueId: true,
      empId: true,
      periodKey: true,
      fileName: true,
      status: true,
      errorText: true,
      createdAt: true,
      uploadedById: true,
      snapshot: { select: { overallOutOf5: true, salesKpiOutOf5: true, skillsOutOf5: true, companyOutOf5: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ uploads });
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(UPLOAD_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.boutiqueId) return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  const boutiqueId = user.boutiqueId;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const empId = (formData.get('empId') as string)?.trim() ?? '';
  const periodKey = (formData.get('periodKey') as string)?.trim() ?? '';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!empId || !periodKey) {
    return NextResponse.json({ error: 'empId, periodKey required' }, { status: 400 });
  }
  if (!/^\d{4}(-\d{2})?$/.test(periodKey)) {
    return NextResponse.json({ error: 'periodKey must be YYYY or YYYY-MM' }, { status: 400 });
  }
  const fileName = (file.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.test(fileName)) {
    return NextResponse.json({ error: 'File must be .xlsx, .xlsm, or .xls' }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { empId }, select: { empId: true } });
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 400 });
  }

  const template = await prisma.kpiTemplate.findFirst({
    where: { code: OFFICIAL_TEMPLATE_CODE, isActive: true },
    select: { id: true, cellMapJson: true },
  });
  if (!template) {
    return NextResponse.json({ error: 'Official KPI template not found. Run seed-official first.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  const upload = await prisma.kpiUpload.create({
    data: {
      templateId: template.id,
      boutiqueId,
      empId,
      periodKey,
      fileName: file.name,
      fileHash,
      uploadedById: user.id,
      status: 'PARSED',
      errorText: null,
    },
  });

  try {
    const result = parseKpiExcel(buffer, template.cellMapJson);
    await prisma.employeeKpiSnapshot.create({
      data: {
        uploadId: upload.id,
        boutiqueId,
        empId,
        periodKey,
        overallOutOf5: result.overallOutOf5,
        salesKpiOutOf5: result.salesKpiOutOf5,
        skillsOutOf5: result.skillsOutOf5,
        companyOutOf5: result.companyOutOf5,
        sectionsJson: result.sections as object,
        rawJson: result.raw as object,
      },
    });
    await logKpiAudit({
      actorId: user.id,
      action: 'KPI_UPLOAD_PARSED',
      boutiqueId,
      empId,
      periodKey,
      metadata: { uploadId: upload.id },
    });
    const snapshot = await prisma.employeeKpiSnapshot.findUnique({
      where: { uploadId: upload.id },
    });
    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      status: 'PARSED',
      snapshot: snapshot
        ? {
            overallOutOf5: snapshot.overallOutOf5,
            salesKpiOutOf5: snapshot.salesKpiOutOf5,
            skillsOutOf5: snapshot.skillsOutOf5,
            companyOutOf5: snapshot.companyOutOf5,
            sections: snapshot.sectionsJson,
          }
        : null,
    });
  } catch (parseError) {
    const errorText = parseError instanceof Error ? parseError.message : String(parseError);
    await prisma.kpiUpload.update({
      where: { id: upload.id },
      data: { status: 'FAILED', errorText },
    });
    await logKpiAudit({
      actorId: user.id,
      action: 'KPI_UPLOAD_FAILED',
      boutiqueId,
      empId,
      periodKey,
      metadata: { uploadId: upload.id, error: errorText },
    });
    return NextResponse.json(
      { ok: false, uploadId: upload.id, status: 'FAILED', error: errorText },
      { status: 422 }
    );
  }
}
