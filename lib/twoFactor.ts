import * as jose from 'jose';
import type { Role } from '@prisma/client';

/** Roles that must enroll in and use TOTP 2FA. */
export const ROLES_REQUIRING_2FA: Role[] = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'];

export function roleRequires2FA(role: Role): boolean {
  return ROLES_REQUIRING_2FA.includes(role);
}

function getPendingSecret(): Uint8Array {
  const s = process.env.MOBILE_JWT_ACCESS_SECRET;
  if (!s || s.length < 16) {
    throw new Error('MOBILE_JWT_ACCESS_SECRET must be set for 2FA pending tokens');
  }
  return new TextEncoder().encode(s);
}

export type TwoFactorPendingPayload = {
  userId: string;
  purpose: '2fa_login' | '2fa_setup';
};

export async function signTwoFactorPendingToken(
  payload: TwoFactorPendingPayload,
  expiresIn = '5m'
): Promise<string> {
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getPendingSecret());
}

export async function verifyTwoFactorPendingToken(
  token: string,
  expectedPurpose: TwoFactorPendingPayload['purpose']
): Promise<TwoFactorPendingPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getPendingSecret());
    if (payload.purpose !== expectedPurpose) return null;
    const userId = payload.userId;
    if (typeof userId !== 'string' || !userId) return null;
    return { userId, purpose: expectedPurpose };
  } catch {
    return null;
  }
}
