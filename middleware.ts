import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { FEATURES } from '@/lib/featureFlags';

const publicPaths = ['/login'];
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const DEMO_LOGOUT_PATH = '/api/auth/logout';

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

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // DEMO_VIEWER global write-block: block all mutations except logout
  if (pathname.startsWith('/api/') && MUTATION_METHODS.includes(request.method?.toUpperCase() ?? 'GET')) {
    if (pathname !== DEMO_LOGOUT_PATH) {
      try {
        const base = request.nextUrl.origin;
        const res = await fetch(`${base}/api/internal/session-role`, {
          headers: { Cookie: request.headers.get('cookie') ?? '' },
          cache: 'no-store',
        });
        const data = (await res.json()) as { role?: string };
        if (data.role === 'DEMO_VIEWER') {
          return NextResponse.json(
            { error: 'Demo mode: read-only. This action is not allowed.' },
            { status: 403 }
          );
        }
      } catch {
        // On error, allow through; route handler will enforce auth
      }
    }
  }

  if (!FEATURES.EXECUTIVE) {
    if (pathname.startsWith('/api/executive')) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    if (pathname.startsWith('/executive')) {
      return NextResponse.redirect(new URL('/', request.url));
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
    '/area',
    '/area/:path*',
    '/sales',
    '/sales/:path*',
    '/boutique',
    '/boutique/:path*',
    '/kpi',
    '/kpi/:path*',
    '/compliance',
    '/app/:path*',
    '/(dashboard)/:path*',
    '/api/:path*',
  ],
};
