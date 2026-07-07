import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { validateCsrf } from '@/lib/csrf';
import { verifyTwoFactorPendingToken } from '@/lib/twoFactor';
import { createSession, setSessionCookie } from '@/lib/auth';
import { clearFailedLogin } from '@/lib/authRateLimit';
import { writeAuthAudit } from '@/lib/authAudit';
import { decryptTotpSecret, verifyTotpCode } from '@/lib/totp';
import { cookies } from 'next/headers';

const GENERIC_MESSAGE = 'Invalid credentials';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 403 });
  }

  const client = getRequestClientInfo(request.headers);

  try {
    const body = await request.json();
    const setupToken = String(body.setupToken ?? '');
    const code = String(body.code ?? '').trim();

    if (!setupToken || !code) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 400 });
    }

    const pending = await verifyTwoFactorPendingToken(setupToken, '2fa_setup');
    if (!pending) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: pending.userId },
      include: { boutique: { select: { id: true, name: true, code: true } } },
    });

    if (!user || user.disabled || !user.totpSecretEncrypted) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    const secret = decryptTotpSecret(user.totpSecretEncrypted);
    if (!secret || !verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true },
    });

    await clearFailedLogin(user.id);
    await writeAuthAudit({
      event: '2FA_SUCCESS',
      userId: user.id,
      emailAttempted: user.empId,
      reason: 'ENROLLED',
      ...client,
    });
    await writeAuthAudit({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      emailAttempted: user.empId,
      metadata: { via2faSetup: true },
      ...client,
    });

    const sessionToken = await createSession(user.id);
    const cookieStore = await cookies();
    const isHttps = new URL(request.url).protocol === 'https:';
    cookieStore.set(setSessionCookie(sessionToken, { secure: isHttps }));

    return NextResponse.json({
      ok: true,
      empId: user.empId,
      role: user.role,
      boutiqueId: user.boutiqueId,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (err) {
    console.error('[auth/2fa/confirm]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
