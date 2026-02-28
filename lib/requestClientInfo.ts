/**
 * Extract client IP, User-Agent, and device hint from request headers.
 * Safe for use behind Nginx/reverse proxy (x-forwarded-for, x-real-ip, cf-connecting-ip).
 */

function getFirstForwardedIp(header: string | null): string | null {
  if (!header || typeof header !== 'string') return null;
  const first = header.split(',')[0]?.trim();
  return first || null;
}

function parseDeviceHint(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (/\b(mobile|android|iphone|ipad|ipod|webos|blackberry|iemobile|opera mini)\b/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export type RequestClientInfo = {
  ip: string | null;
  userAgent: string | null;
  deviceHint: string | null;
};

/**
 * Read client IP (proxy-aware) and User-Agent from request headers.
 * Order for IP: x-forwarded-for (first) -> x-real-ip -> cf-connecting-ip.
 */
export function getRequestClientInfo(reqHeaders: Headers): RequestClientInfo {
  const forwardedFor = reqHeaders.get('x-forwarded-for');
  const realIp = reqHeaders.get('x-real-ip');
  const cfIp = reqHeaders.get('cf-connecting-ip');

  const ip =
    getFirstForwardedIp(forwardedFor) ??
    (realIp && realIp.trim() ? realIp.trim() : null) ??
    (cfIp && cfIp.trim() ? cfIp.trim() : null) ??
    null;

  const userAgent = reqHeaders.get('user-agent')?.trim() ?? null;
  const deviceHint = parseDeviceHint(userAgent);

  return { ip, userAgent, deviceHint };
}
