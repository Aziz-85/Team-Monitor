import type { NextRequest } from 'next/server';

/** Best-effort client IP for audit (behind proxies). */
export function getRequestClientIp(request: NextRequest): string | undefined {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || undefined;
}
