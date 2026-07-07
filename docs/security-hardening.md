# Security Hardening Checklist

Audit date: 2026-07-07  
Scope: web login, sessions, passwords, 2FA, CSRF, audit logs.

## Status summary

| # | Control | Status | Implementation |
|---|---------|--------|----------------|
| 1 | Hide version/build on login | **Done** | Footer moved to authenticated shell only (`components/auth/VersionFooter.tsx`) |
| 2 | Login rate limiting | **Done** | `lib/authRateLimit.ts` — 10/IP, 5/username per 10 min |
| 3 | Account lockout (5 failures) | **Done** | `LOGIN_LOCKOUT_AFTER_ATTEMPTS=5`, 15 min lock |
| 4 | 2FA for supervisors | **Done** | TOTP for ADMIN, SUPER_ADMIN, MANAGER — `lib/totp.ts`, `/api/auth/2fa/*` |
| 5 | Secure cookies | **Done** | `dt_session`: HttpOnly, Secure (prod), SameSite=Lax; `dt_locale` hardened |
| 6 | CSRF protection | **Done** | Double-submit cookie on auth forms — `lib/csrf.ts`, `/api/auth/csrf` |
| 7 | Failed login audit | **Done** | `lib/authAudit.ts` + `AuthAuditLog` (web + mobile) |
| 8 | Strong passwords | **Done** | `lib/passwordPolicy.ts` — min 12, complexity, blocklist |
| 9 | Generic error messages | **Done** | Login/change-password APIs return non-enumerating messages |
| 10 | Package & server updates | **Ops** | Run `npm run security:audit` weekly; patch OS/Node monthly |

## 2FA enrollment

Roles **ADMIN**, **SUPER_ADMIN**, and **MANAGER** must enroll on next login:

1. Password accepted → setup screen with TOTP secret
2. Scan in authenticator app (Google Authenticator, etc.)
3. Enter 6-digit code → session created

Subsequent logins: password → TOTP code.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MOBILE_JWT_ACCESS_SECRET` | JWT signing + 2FA pending tokens (min 16 chars) |
| `AUTH_TOTP_ENCRYPTION_KEY` | Optional dedicated key for encrypting TOTP secrets at rest |

## Operations (item 10)

```bash
npm run security:audit
npm run db:migrate
```

**Recommended cadence:** weekly `npm run security:audit`; monthly dependency + OS patches.

## Admin audit

Failed logins: `/admin/audit/login` — events include `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `2FA_FAILED`, `SECURITY_ALERT`.
