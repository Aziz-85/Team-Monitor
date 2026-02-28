import { NextRequest, NextResponse } from 'next/server';

/**
 * Browsers request /apple-touch-icon.png automatically.
 * Redirect to favicon so the request succeeds (avoids 500 when no icon file exists).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/favicon.ico', request.url), 302);
}
