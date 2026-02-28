import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';

const KEY = 'DEFAULT_BOUTIQUE_ID';

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const row = await prisma.systemConfig.findUnique({
    where: { key: KEY },
    select: { valueJson: true },
  });

  let boutiqueId: string | null = null;
  if (row?.valueJson) {
    try {
      const parsed = JSON.parse(row.valueJson) as string;
      boutiqueId = typeof parsed === 'string' ? parsed : null;
    } catch {
      boutiqueId = null;
    }
  }

  let boutique: { id: string; code: string; name: string } | null = null;
  if (boutiqueId) {
    boutique = await prisma.boutique.findUnique({
      where: { id: boutiqueId },
      select: { id: true, code: true, name: true },
    });
  }

  return NextResponse.json({
    defaultBoutiqueId: boutiqueId,
    boutique: boutique ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = body.boutiqueId ? String(body.boutiqueId).trim() : null;
  if (!boutiqueId) return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!boutique) return NextResponse.json({ error: 'Boutique not found' }, { status: 400 });

  const existing = await prisma.systemConfig.findUnique({
    where: { key: KEY },
    select: { valueJson: true },
  });
  const oldValue = existing?.valueJson ?? null;

  await prisma.systemConfig.upsert({
    where: { key: KEY },
    update: { valueJson: JSON.stringify(boutiqueId) },
    create: { key: KEY, valueJson: JSON.stringify(boutiqueId) },
  });

  await writeAdminAudit({
    actorUserId: user.id,
    action: 'SYSTEM_DEFAULT_BOUTIQUE_CHANGE',
    entityType: 'SYSTEM_CONFIG',
    entityId: KEY,
    beforeJson: oldValue,
    afterJson: JSON.stringify(boutiqueId),
    reason: `Default boutique changed to ${boutique.code} (${boutique.name})`,
    boutiqueId, // required by DB; use the new default boutique
  });

  return NextResponse.json({
    defaultBoutiqueId: boutiqueId,
    boutique: { id: boutique.id, code: boutique.code, name: boutique.name },
  });
}
