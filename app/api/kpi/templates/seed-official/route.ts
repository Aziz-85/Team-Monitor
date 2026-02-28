/**
 * POST /api/kpi/templates/seed-official — Seed/repair official KPI template. ADMIN only, idempotent.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OFFICIAL_TEMPLATE_CODE, OFFICIAL_TEMPLATE_NAME, getDefaultCellMapJson } from '@/lib/kpi/cellMap';
import { logKpiAudit } from '@/lib/kpi/audit';

export async function POST() {
  let userId: string;
  try {
    const user = await requireRole(['ADMIN']);
    userId = user.id;
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.kpiTemplate.upsert({
    where: { code: OFFICIAL_TEMPLATE_CODE },
    update: { cellMapJson: getDefaultCellMapJson(), updatedAt: new Date() },
    create: {
      code: OFFICIAL_TEMPLATE_CODE,
      name: OFFICIAL_TEMPLATE_NAME,
      version: '1',
      isActive: true,
      cellMapJson: getDefaultCellMapJson(),
    },
  });

  await logKpiAudit({ actorId: userId, action: 'KPI_TEMPLATE_SEEDED', metadata: { templateId: template.id } });

  return NextResponse.json({
    ok: true,
    template: { id: template.id, code: template.code, name: template.name, version: template.version },
  });
}
