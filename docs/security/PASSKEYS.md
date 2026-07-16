# Passkeys (planned — Release 2)

Passkeys via WebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`) will be added after trusted devices are stable.

## Planned environment

```bash
AUTH_PASSKEYS_ENABLED=true
WEBAUTHN_RP_ID=dhtasks.com
WEBAUTHN_RP_NAME=Team Monitor
WEBAUTHN_EXPECTED_ORIGIN=https://dhtasks.com
```

Staging must use its own RP ID / origin.

## Rules (non-negotiable)

- Challenges are server-stored, one-time, short-lived
- Verify RP ID and origin
- Privileged roles require user verification
- Never log public keys or assertions
- Registration requires a signed-in user with recent strong auth
- Passwordless passkeys remain behind `AUTH_PASSWORDLESS_PASSKEY_ENABLED` (Release 4)

See [MODERN_AUTHENTICATION.md](./MODERN_AUTHENTICATION.md).
