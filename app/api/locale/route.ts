import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const LOCALE_COOKIE = 'dt_locale';

export async function POST(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale') ?? 'en';
  if (locale !== 'ar' && locale !== 'en') {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set({
    name: LOCALE_COOKIE,
    value: locale,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE)?.value ?? 'en';
  return NextResponse.json({ locale: locale === 'ar' ? 'ar' : 'en' });
}
