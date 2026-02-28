# Mobile JWT Authentication

Mobile app uses JWT access + refresh tokens. Web app continues to use cookie session (`dt_session`); this flow is independent.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MOBILE_JWT_ACCESS_SECRET` | Yes | Secret to sign/verify access JWTs. Must be at least 16 characters. |
| `MOBILE_JWT_REFRESH_SECRET` | Yes | Secret to sign/verify refresh JWTs. Must be at least 16 characters. |

If either is missing or too short, the server throws a clear error at runtime when mobile auth is used.

## Token expiry

| Token | Expiry |
|-------|--------|
| Access | 15 minutes |
| Refresh | 30 days |

Refresh tokens are stored in the database (`MobileRefreshToken`) as a SHA-256 hash. On refresh, the old token is revoked and a new one is issued (rotation).

## API endpoints

Base path: `/api/mobile`

### POST /api/mobile/auth/login

**Request body:** `{ "empId": string, "password": string, "deviceHint"?: string }`

**Success (200):**
```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>",
  "user": { "id": "...", "empId": "...", "role": "EMPLOYEE" | "MANAGER" | "ASSISTANT_MANAGER" | "ADMIN" },
  "boutiqueId": "..."
}
```

**Errors:** 400 (missing fields), 401 (invalid credentials, disabled, locked), 403 (no boutique), 429 (rate limit).

Rate limit: in-memory, per IP, 10 attempts per 15 minutes. Resets on process restart.

---

### POST /api/mobile/auth/refresh

**Request body:** `{ "refreshToken": string }`

**Success (200):**
```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<new JWT>"
}
```

The old refresh token is revoked; the new one must be used for the next refresh.

**Errors:** 400 (missing token), 401 (invalid or expired refresh token).

---

### POST /api/mobile/auth/logout

**Request body:** `{ "refreshToken": string }`

**Success (200):** `{ "ok": true }`

If the token is invalid, the endpoint still returns 200 and does not revoke anything.

---

### GET /api/mobile/me

**Header:** `Authorization: Bearer <accessToken>`

**Success (200):**
```json
{
  "user": { "id": "...", "empId": "...", "role": "..." },
  "boutique": { "id": "...", "name": "..." },
  "permissions": ["schedule:view", "tasks:own", ...]
}
```

**Errors:** 401 (missing or invalid access token).

---

## cURL examples

### Login
```bash
curl -X POST https://your-server/api/mobile/auth/login \
  -H "Content-Type: application/json" \
  -d '{"empId":"admin","password":"YourPassword","deviceHint":"mobile"}'
```

### Refresh
```bash
curl -X POST https://your-server/api/mobile/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<paste_refresh_token>"}'
```

### Logout
```bash
curl -X POST https://your-server/api/mobile/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<paste_refresh_token>"}'
```

### Me (current user)
```bash
curl -X GET https://your-server/api/mobile/me \
  -H "Authorization: Bearer <access_token>"
```

---

## Security notes

- Access token is short-lived (15 min); use refresh token to obtain a new one.
- Refresh tokens are hashed (SHA-256) in the database; store the raw refresh token only on the client.
- Logout revokes the refresh token server-side.
- Mobile login is rate-limited per IP (in-memory). Web login uses the existing DB-backed rate limit and is unchanged.
