# Number Matching Push Approval (planned — Release 3)

Custom Team Monitor authenticator devices with signed approvals. **Not** Microsoft Authenticator.

## Non-negotiable

- Push payloads contain only a non-sensitive challenge reference
- Never put the matching number, session token, password, or TOTP secret in the push body
- Challenges expire ≤120 seconds, one-time consume, bound to browser session nonce + device signature
- Require `AUTH_PUSH_APPROVAL_ENABLED=true` and a registered `AuthenticatorDevice`

Do not deploy until the mobile authenticator registration flow exists.

See [MODERN_AUTHENTICATION.md](./MODERN_AUTHENTICATION.md).
