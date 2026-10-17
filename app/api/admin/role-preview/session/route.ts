import { NextRequest, NextResponse } from 'next/server';
import { getBaseSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePreviewCookieName } from '@/lib/env/cookies';
import { encodeRolePreviewConfig, isRolePreviewEnabled, type PreviewRole } from '@/lib/rolePreview';

const PREVIEW_ROLES: PreviewRole[] = ['EMPLOYEE', 'ASSISTANT_MANAGER', 'MANAGER', 'AREA_MANAGER'];

function isLocalRequest(request: NextRequest) {
  // `next dev` can reconstruct request.nextUrl from an application/base URL,
  // so its hostname is not always the address the browser actually used.
  // Development mode is local-only for this feature and still requires the
  // explicit ROLE_PREVIEW_ENABLED flag plus an ADMIN/SUPER_ADMIN session.
  if (process.env.NODE_ENV === 'development') return true;

  const candidates = [
    request.nextUrl.hostname,
    request.headers.get('host')?.split(':')[0],
    request.headers.get('x-forwarded-host')?.split(':')[0],
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/^\[|\]$/g, ''));

  return candidates.some((host) =>
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  );
}

function cookie(value: string, maxAge: number) {
  return { name: getRolePreviewCookieName(), value, httpOnly: true, sameSite: 'lax' as const, secure: false, path: '/', maxAge };
}

async function requireLocalAdmin(request: NextRequest) {
  if (!isRolePreviewEnabled() || !isLocalRequest(request)) return null;
  const user = await getBaseSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const actor = await requireLocalAdmin(request);
  if (!actor) return NextResponse.json({ error: 'Role preview is available to local administrators only.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const role = typeof body.role === 'string' && PREVIEW_ROLES.includes(body.role as PreviewRole) ? body.role as PreviewRole : null;
  const requestedBoutiqueIds = Array.isArray(body.boutiqueIds) ? body.boutiqueIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 20) : [];
  const target = await prisma.user.findFirst({ where: { id: userId, disabled: false }, select: { id: true } });
  if (!target || !role) return NextResponse.json({ error: 'Select an active account and preview role.' }, { status: 400 });
  const activeBoutiques = await prisma.boutique.findMany({ where: { id: { in: requestedBoutiqueIds }, isActive: true }, select: { id: true } });
  const boutiqueIds = activeBoutiques.map((item) => item.id);
  if (boutiqueIds.length === 0 || (role === 'AREA_MANAGER' && boutiqueIds.length < 2)) return NextResponse.json({ error: role === 'AREA_MANAGER' ? 'Area Manager preview requires at least two boutiques.' : 'Select an active boutique.' }, { status: 400 });
  const config = encodeRolePreviewConfig({ targetUserId: target.id, role, boutiqueIds: role === 'AREA_MANAGER' ? boutiqueIds : boutiqueIds.slice(0, 1) });
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set(cookie(config, 60 * 60 * 2));
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isRolePreviewEnabled() || !isLocalRequest(request)) return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie('', 0));
  return response;
}
