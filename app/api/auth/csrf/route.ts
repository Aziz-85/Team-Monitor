import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateCsrfToken, csrfCookie } from '@/lib/csrf';

export async function GET(request: NextRequest) {
  const token = generateCsrfToken();
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = process.env.NODE_ENV === 'production' || isHttps;
  const cookieStore = await cookies();
  cookieStore.set(csrfCookie(token, secure));
  return NextResponse.json({ csrfToken: token });
}
