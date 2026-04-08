import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { FEATURES } from '@/lib/featureFlags';

const publicPaths = ['/login'];
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const DEMO_LOGOUT_PATH = '/api/auth/logout';

/**
 * Origin used when middleware calls same-app APIs (session role check).
 * `request.nextUrl.origin` is often wrong behind nginx/Docker (internal host, [::]:port, etc.),
 * which breaks the internal fetch and shows "Unable to verify session for write".
 *
 * Override with APP_INTERNAL_ORIGIN (e.g. http://127.0.0.1:3002) if the server cannot hairpin to its public URL.
 */
function getMiddlewareInternalOrigin(request: NextRequest): string {
  const explicit = process.env.APP_INTERNAL_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const v = vercel.replace(/\/$/, '');
    return v.startsWith('http') ? v : `https://${v}`;
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : 'https';
    try {
      return new URL(`${proto}://${forwardedHost}`).origin;
    } catch {
      /* fall through */
    }
  }

  return request.nextUrl.origin;
}

function isPublic(pathname: string): boolean {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** All non-public, non-API app routes require session (banking-grade: protect at edge). */
function isAuthRequired(pathname: string): boolean {
  if (isPublic(pathname)) return false;
  if (pathname.startsWith('/api')) return false;
  return true;
}

/** Paths that must never run auth logic (Next internals + static assets). */
function isNextInternalOrStatic(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return true;
  if (pathname === '/apple-touch-icon.png' || pathname.startsWith('/apple-touch-icon')) return true;
  return false;
}

/** Paths we must never redirect (API, Next internals, static). */
function isRedirectAllowlisted(pathname: string): boolean {
  if (pathname.startsWith('/api')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return true;
  if (pathname === '/apple-touch-icon.png' || pathname.startsWith('/apple-touch-icon')) return true;
  return false;
}

/**
 * Clean path: strip /app, remove route-group segments like /(dashboard).
 * Returns null if path is already clean (no redirect needed). Avoids loops because
 * the cleaned path no longer contains "/app/" or "(dashboard)".
 */
function cleanWrongPath(pathname: string): string | null {
  if (isRedirectAllowlisted(pathname)) return null;
  const decoded = decodeURIComponent(pathname);
  const hasWrong =
    decoded.startsWith('/app/') ||
    decoded.includes('(dashboard)') ||
    decoded.startsWith('/(dashboard)/');
  if (!hasWrong) return null;

  let path = decoded;
  if (path.startsWith('/app/')) path = path.slice(4);
  path = path.replace(/\/\([^/]+\)/g, '');
  path = path.replace(/\/+/g, '/');
  if (!path || path === '') path = '/';
  else if (!path.startsWith('/')) path = '/' + path;

  if (path === decoded) return null;
  return path;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isNextInternalOrStatic(pathname)) {
    return NextResponse.next();
  }

  const cleanPath = cleanWrongPath(pathname);
  if (cleanPath !== null) {
    const url = new URL(request.url);
    url.pathname = cleanPath;
    return NextResponse.redirect(url, 308);
  }

  const session = request.cookies.get('dt_session')?.value;

  // DEMO_VIEWER write-block + fail-closed role verification when a session cookie is present.
  // Runs before /api/auth bypass so POST /api/auth/change-password cannot mutate as demo.
  // No cookie: skip (login/cron/machine routes rely on handlers or other secrets).
  if (
    session &&
    pathname.startsWith('/api/') &&
    MUTATION_METHODS.includes(request.method?.toUpperCase() ?? 'GET') &&
    pathname !== DEMO_LOGOUT_PATH
  ) {
    try {
      const base = getMiddlewareInternalOrigin(request);
      const res = await fetch(`${base}/api/internal/session-role`, {
        headers: { Cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Unable to verify session for write. Try again.' },
          { status: 503 }
        );
      }
      const data = (await res.json()) as { role?: string | null };
      if (data.role === 'DEMO_VIEWER') {
        return NextResponse.json(
          { error: 'Demo mode: read-only. This action is not allowed.' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Unable to verify session for write. Try again.' },
        { status: 503 }
      );
    }
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (!FEATURES.EXECUTIVE) {
    if (pathname.startsWith('/api/executive')) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    if (pathname.startsWith('/executive')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (isPublic(pathname)) {
    // Do not redirect /login -> / based on cookie alone: cookie may be stale/invalid and
    // would cause a redirect loop (app would send back to /login, middleware again to /).
    return NextResponse.next();
  }

  if (isAuthRequired(pathname) && !session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('from', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

// Run middleware on page routes (auth, redirects). Include /api/:path* for DEMO_VIEWER guard.
export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard',
    '/dashboard/:path*',
    '/about',
    '/employee/:path*',
    '/schedule/:path*',
    '/tasks/:path*',
    '/planner-export',
    '/change-password',
    '/admin/:path*',
    '/approvals',
    '/leaves',
    '/leaves/:path*',
    '/inventory/:path*',
    '/me/:path*',
    '/sync/:path*',
    '/executive',
    '/executive/:path*',
    '/performance',
    '/performance/:path*',
    '/area',
    '/area/:path*',
    '/sales',
    '/sales/:path*',
    '/boutique',
    '/boutique/:path*',
    '/kpi',
    '/kpi/:path*',
    '/compliance',
    '/nav',
    '/nav/:path*',
    '/reports',
    '/reports/:path*',
    '/company',
    '/company/:path*',
    '/targets',
    '/targets/:path*',
    '/app/:path*',
    '/(dashboard)/:path*',
    '/api/:path*',
  ],
};
