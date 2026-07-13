import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken, csrfCookie } from '@/lib/csrf';
import { shouldUseSecureCookies } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = generateCsrfToken();
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = shouldUseSecureCookies() || isHttps;
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(csrfCookie(token, secure));
  return res;
}
