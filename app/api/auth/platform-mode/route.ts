import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyUserPassword } from '@/lib/auth';
import { writeAuthAudit } from '@/lib/authAudit';
import { validateCsrf } from '@/lib/csrf';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { decryptTotpSecret, verifyTotpCode } from '@/lib/totp';
import {
  getAuthenticatedSession,
  setBranchManagerMode,
  setPlatformAdminMode,
} from '@/lib/platformOwner/session';

const GENERIC = 'Unable to change platform mode';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: GENERIC }, { status: 403 });
  }

  const client = getRequestClientInfo(request.headers);
  const auth = await getAuthenticatedSession();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!auth.user.isPlatformOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { action?: string; password?: string; totpCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  const action = body.action === 'enable' ? 'enable' : body.action === 'disable' ? 'disable' : null;
  if (!action) {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  if (action === 'disable') {
    await setBranchManagerMode(auth.session.id);
    await writeAuthAudit({
      event: 'PLATFORM_MODE_DISABLED',
      userId: auth.user.id,
      emailAttempted: auth.user.empId,
      ...client,
    });
    return NextResponse.json({ ok: true, activeMode: 'BRANCH_MANAGER' });
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { totpEnabled: true, totpSecretEncrypted: true },
  });
  if (!userRecord) {
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  let stepUpOk = false;
  if (userRecord.totpEnabled && userRecord.totpSecretEncrypted) {
    const code = String(body.totpCode ?? '').trim();
    const secret = decryptTotpSecret(userRecord.totpSecretEncrypted);
    stepUpOk = Boolean(secret && verifyTotpCode(secret, code));
  } else {
    const password = String(body.password ?? '');
    stepUpOk = await verifyUserPassword(auth.user.id, password);
  }

  if (!stepUpOk) {
    await writeAuthAudit({
      event: 'SECURITY_ALERT',
      userId: auth.user.id,
      emailAttempted: auth.user.empId,
      reason: 'PLATFORM_MODE_STEP_UP_FAILED',
      ...client,
    });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  await setPlatformAdminMode(auth.session.id);
  await writeAuthAudit({
    event: 'PLATFORM_MODE_ENABLED',
    userId: auth.user.id,
    emailAttempted: auth.user.empId,
    ...client,
  });

  return NextResponse.json({ ok: true, activeMode: 'PLATFORM_ADMIN' });
}

export async function GET() {
  const auth = await getAuthenticatedSession();
  if (!auth) {
    return NextResponse.json({ isPlatformOwner: false, activeMode: 'BRANCH_MANAGER' }, { status: 200 });
  }

  return NextResponse.json({
    isPlatformOwner: auth.access.isPlatformOwner,
    activeMode: auth.access.activeMode,
    effectiveRole: auth.access.effectiveRole,
    globalScope: auth.access.globalScope,
    boutiqueLabel: auth.user.boutique
      ? `${auth.user.boutique.name} (${auth.user.boutique.code})`
      : auth.user.boutiqueId,
    requiresStepUp: auth.user.totpEnabled ? 'totp' : 'password',
  });
}
