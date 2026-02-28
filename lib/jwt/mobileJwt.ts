import * as jose from 'jose';
import type { Role } from '@prisma/client';

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '30d';

function getAccessSecret(): string {
  const s = process.env.MOBILE_JWT_ACCESS_SECRET;
  if (!s || s.length < 16) {
    throw new Error('MOBILE_JWT_ACCESS_SECRET must be set and at least 16 characters');
  }
  return s;
}

function getRefreshSecret(): string {
  const s = process.env.MOBILE_JWT_REFRESH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('MOBILE_JWT_REFRESH_SECRET must be set and at least 16 characters');
  }
  return s;
}

export type AccessPayload = {
  userId: string;
  role: Role;
  boutiqueId: string;
  sub: string;
};

export type RefreshPayload = {
  userId: string;
  tokenId: string;
  sub: string;
};

export async function signAccessToken(payload: {
  userId: string;
  role: Role;
  boutiqueId: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(getAccessSecret());
  return new jose.SignJWT({
    userId: payload.userId,
    role: payload.role,
    boutiqueId: payload.boutiqueId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(secret);
}

export async function signRefreshToken(payload: { userId: string; tokenId: string }): Promise<string> {
  const secret = new TextEncoder().encode(getRefreshSecret());
  return new jose.SignJWT({
    userId: payload.userId,
    tokenId: payload.tokenId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const secret = new TextEncoder().encode(getAccessSecret());
  const { payload } = await jose.jwtVerify(token, secret);
  return {
    userId: payload.userId as string,
    role: payload.role as Role,
    boutiqueId: payload.boutiqueId as string,
    sub: payload.sub as string,
  };
}

export async function verifyRefreshToken(token: string): Promise<RefreshPayload> {
  const secret = new TextEncoder().encode(getRefreshSecret());
  const { payload } = await jose.jwtVerify(token, secret);
  return {
    userId: payload.userId as string,
    tokenId: payload.tokenId as string,
    sub: payload.sub as string,
  };
}
