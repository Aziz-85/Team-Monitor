/**
 * Require ADMIN role for admin CRUD. Throws AuthError on failure.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import type { Role } from '@prisma/client';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

export async function requireAdmin() {
  return requireRole(ADMIN_ROLES);
}

export function handleAdminError(e: unknown): NextResponse {
  const err = e as { code?: string };
  if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
