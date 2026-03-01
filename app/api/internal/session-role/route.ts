/**
 * Internal: returns current session role for middleware.
 * Used by DEMO_VIEWER global guard. No auth required (returns null if no session).
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ role: user?.role ?? null });
}
