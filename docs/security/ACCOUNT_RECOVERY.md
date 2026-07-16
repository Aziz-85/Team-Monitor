# Account Recovery

## During trusted-devices / passkey rollout

- **TOTP remains enabled** and is the primary fallback
- Trusted devices only skip TOTP while valid; password is always required after logout/idle
- There is **no master bypass code**

## Planned recovery codes (later)

- Generate 10 one-time codes
- Store hashes only; show plaintext once
- Regeneration requires recent strong authentication
- Using a code invalidates it

## SUPER_ADMIN emergency procedure

1. Use an existing privileged operator account with working TOTP (or database console access under change-control)
2. Reset the locked user’s password via admin reset (invalidates sessions + trusted devices)
3. Have the user re-enroll TOTP on next login if secrets were cleared under a controlled procedure
4. Record the incident in AuthAuditLog / ops runbook

Do not ship a hidden backdoor. Document any emergency DB steps in the private ops runbook, not in application code.
