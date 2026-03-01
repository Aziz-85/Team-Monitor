/**
 * Demo mode (DEMO_VIEWER): read-only guard for API routes.
 * Call at the start of any mutation handler (POST/PUT/PATCH/DELETE).
 * Allows GET/HEAD/OPTIONS; allows POST /api/auth/logout so demo user can sign out.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SessionUser } from '@/lib/auth';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Returns a 403 NextResponse if user is DEMO_VIEWER and request is a mutation (except logout). Otherwise returns null. */
export function getDemoGuardResponse(request: NextRequest, user: SessionUser | null): NextResponse | null {
  if (!user || user.role !== 'DEMO_VIEWER') return null;
  const method = request.method?.toUpperCase() ?? 'GET';
  if (!MUTATION_METHODS.includes(method)) return null;
  const pathname = request.nextUrl?.pathname ?? '';
  if (pathname === '/api/auth/logout') return null;
  return NextResponse.json(
    { error: 'Demo mode: read-only. This action is not allowed.' },
    { status: 403 }
  );
}

/** Use in API route: const guard = getDemoGuardResponse(request, await getSessionUser()); if (guard) return guard; */
export async function requireNotDemoViewer(
  request: NextRequest,
  getUser: () => Promise<SessionUser | null>
): Promise<NextResponse | null> {
  const user = await getUser();
  return getDemoGuardResponse(request, user);
}
