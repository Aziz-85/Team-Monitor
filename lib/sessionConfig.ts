/**
 * Session and auth security config from env.
 * Defaults: 30 min idle, 12 h max session.
 */
const env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};

export const SESSION_IDLE_MINUTES = Math.max(1, Math.min(120, parseInt(env.SESSION_IDLE_MINUTES ?? '30', 10) || 30));
export const SESSION_MAX_HOURS = Math.max(1, Math.min(168, parseInt(env.SESSION_MAX_HOURS ?? '12', 10) || 12));

/** Only update lastSeenAt if older than this (throttle DB writes) */
export const SESSION_LAST_SEEN_THROTTLE_MINUTES = 2;

/** Login rate limit: max attempts per window */
export const LOGIN_RATE_LIMIT_PER_IP = 10;
export const LOGIN_RATE_LIMIT_PER_EMAIL = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 10;

/** Account lockout after N consecutive failures */
export const LOGIN_LOCKOUT_AFTER_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

/** Security alert: log SECURITY_ALERT if same IP has more than N failures in window */
export const SECURITY_ALERT_FAILED_ATTEMPTS_THRESHOLD = 8;
