# Modern Authentication

Team Monitor is modernizing privileged-role authentication incrementally.

## Goals

1. **Trusted devices** — reduce daily TOTP friction without replacing password sessions
2. **Passkeys (WebAuthn)** — Face ID / Touch ID / Windows Hello as second factor
3. **Number-matching push approval** — Team Monitor authenticator app only (not Microsoft Authenticator)
4. Keep **TOTP** as a secure fallback
5. Do not weaken password rate limits, lockout, CSRF, or audit controls

## Feature flags

| Flag | Default | Release |
|------|---------|---------|
| `AUTH_TRUSTED_DEVICES_ENABLED` | `false` | Release 1 |
| `AUTH_PASSKEYS_ENABLED` | `false` | Release 2 |
| `AUTH_PUSH_APPROVAL_ENABLED` | `false` | Release 3 |
| `AUTH_PASSWORDLESS_PASSKEY_ENABLED` | `false` | Release 4 |

Do not enable later phases until prior phases are stable in production.

## Policy module

`lib/auth/authenticationPolicy.ts` decides the next auth step after password verification based on role, trusted-device validity, available passkeys/authenticator devices, and whether a sensitive step-up is required.

Sensitive actions must call `requireRecentStrongAuth()` (10-minute freshness) even when a trusted device cookie is present.

## Non-negotiables

- No raw trusted-device tokens in the database
- No passkey private keys on the server
- No sign-in numbers or secrets in push notification payloads
- No reusable challenges
- No master bypass code
- Employee password-only login remains unchanged unless they enroll in optional factors later

## Docs

- [TRUSTED_DEVICES.md](./TRUSTED_DEVICES.md)
- [PASSKEYS.md](./PASSKEYS.md) (planned)
- [NUMBER_MATCHING.md](./NUMBER_MATCHING.md) (planned)
- [ACCOUNT_RECOVERY.md](./ACCOUNT_RECOVERY.md)
