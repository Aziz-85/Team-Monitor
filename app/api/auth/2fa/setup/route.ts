import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { validateCsrf } from '@/lib/csrf';
import { verifyTwoFactorPendingToken } from '@/lib/twoFactor';
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
} from '@/lib/totp';

const GENERIC_MESSAGE = 'Request could not be completed.';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 403 });
  }

  void getRequestClientInfo(request.headers);

  try {
    const body = await request.json();
    const setupToken = String(body.setupToken ?? '');

    if (!setupToken) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 400 });
    }

    const pending = await verifyTwoFactorPendingToken(setupToken, '2fa_setup');
    if (!pending) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: pending.userId } });
    if (!user || user.disabled) {
      return NextResponse.json({ error: GENERIC_MESSAGE }, { status: 401 });
    }

    let secret = user.totpSecretEncrypted ? decryptTotpSecret(user.totpSecretEncrypted) : null;
    if (!secret) {
      secret = generateTotpSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecretEncrypted: encryptTotpSecret(secret), totpEnabled: false },
      });
    }

    return NextResponse.json({
      ok: true,
      otpauthUri: buildOtpAuthUri(secret, user.empId),
      manualSecret: secret,
    });
  } catch (err) {
    console.error('[auth/2fa/setup]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
