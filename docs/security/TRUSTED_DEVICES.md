# Trusted Devices

Release 1 of modern authentication.

## Purpose

After successful **password + TOTP**, a user may trust the current browser for up to **30 days** (max **90**). While trust is valid:

- Password is still required when the session expires or the user logs out
- TOTP may be skipped on that browser
- Trust never replaces the normal authenticated session cookie

All trust decisions are **server-side**.

## Cookie

| Property | Value |
|----------|--------|
| Name | `{COOKIE_PREFIX}trusted_device` (staging: `dt_staging_trusted_device`) |
| Flags | `HttpOnly`, `Secure` in deployed environments, `SameSite=Lax`, `Path=/` |
| Value | Raw random token (≥32 bytes, base64url) |

Database stores only **HMAC-SHA256** of the token (`AUTH_TRUSTED_DEVICE_SECRET`, falling back to `AUTH_TOTP_ENCRYPTION_KEY` / `MOBILE_JWT_ACCESS_SECRET`).

On each successful trust use, the token is **rotated** (new raw cookie + new hash).

## Model

`TrustedAuthDevice` — see Prisma schema. Includes device name, browser/OS hints, hashed user-agent, first/last IP, expiry, revoke metadata.

## Invalidation

Trust is revoked when:

- User password changes (self or admin reset)
- Account is disabled
- User revokes one/all devices in `/settings/security`
- SUPER_ADMIN signs out all devices for a user
- Trust expires
- Token is unknown / mismatched / revoked (audited as `TRUSTED_DEVICE_REJECTED`)

## APIs

- `GET /api/auth/trusted-devices`
- `POST /api/auth/trusted-devices/revoke`
- `POST /api/auth/trusted-devices/revoke-all`
- `PATCH /api/auth/trusted-devices/:id`

## Audit events

`TRUSTED_DEVICE_CREATED` · `TRUSTED_DEVICE_USED` · `TRUSTED_DEVICE_ROTATED` · `TRUSTED_DEVICE_REVOKED` · `TRUSTED_DEVICES_REVOKED_ALL` · `TRUSTED_DEVICE_REJECTED`

Never log raw tokens or full fingerprints.

## Enable

```bash
AUTH_TRUSTED_DEVICES_ENABLED=true
AUTH_TRUSTED_DEVICE_SECRET=<long random secret>
```

## UI

Login TOTP step: “Trust this device for 30 days” with shared-device warning (EN/AR).

Account security: `/settings/security`
