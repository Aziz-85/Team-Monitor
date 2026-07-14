import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { prisma } from '@/lib/db';
import { APP_THEME_KEY, getAppTheme, isAppTheme } from '@/lib/appTheme';

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }
  return NextResponse.json({ theme: await getAppTheme() });
}

export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  const body = await request.json().catch(() => ({}));
  if (!isAppTheme(body.theme)) {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
  }

  const previous = await getAppTheme();
  await prisma.systemConfig.upsert({
    where: { key: APP_THEME_KEY },
    update: { valueJson: JSON.stringify(body.theme) },
    create: { key: APP_THEME_KEY, valueJson: JSON.stringify(body.theme) },
  });
  await writeAdminAudit({
    actorUserId: user.id,
    action: 'SYSTEM_THEME_CHANGE',
    entityType: 'SYSTEM_CONFIG',
    entityId: APP_THEME_KEY,
    beforeJson: JSON.stringify(previous),
    afterJson: JSON.stringify(body.theme),
    reason: `Application theme changed from ${previous} to ${body.theme}`,
    boutiqueId: user.boutiqueId,
  });
  return NextResponse.json({ theme: body.theme });
}
