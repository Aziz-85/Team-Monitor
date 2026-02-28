# Versioning & Deploy Tracking

## Semantic version (package.json)

- The app version is defined in `package.json` (`version` field), e.g. `1.2.0`.
- At **build time**, Next.js injects:
  - `NEXT_PUBLIC_APP_VERSION` — from `package.json` version
  - `NEXT_PUBLIC_GIT_HASH` — from `git rev-parse --short HEAD`
  - `NEXT_PUBLIC_BUILD_DATE` — ISO string at build time
- These are available in server and client via `lib/version.ts` and are **not secret**.

## How to bump version

Run:

```bash
./scripts/bump-version.sh patch   # 1.2.0 → 1.2.1
./scripts/bump-version.sh minor   # 1.2.0 → 1.3.0
./scripts/bump-version.sh major   # 1.2.0 → 2.0.0
```

This updates `package.json` with `npm version <type> --no-git-tag-version` and, if present, writes the new version to a `VERSION` file.

## Build metadata

- **APP_VERSION**: from `package.json` (or env override).
- **GIT_HASH**: short git commit hash at build time (empty if not in a git repo).
- **BUILD_DATE**: ISO timestamp when the build was run.
- **Environment**: from `APP_ENV` or derived from `NODE_ENV` (`production` / `local`).

The public API `GET /api/version` returns:

```json
{
  "appVersion": "1.2.0",
  "gitHash": "abc1234",
  "buildDate": "2025-03-25T12:00:00.000Z",
  "environment": "production"
}
```

## Registering a deploy (Admin)

1. Go to **Admin → Version & Deploys** (`/admin/system/version`).
2. In the **Current Build** card, click **Register current deploy**.
3. Optionally add notes and confirm. This creates a **DeployRecord** in the database with:
   - `appVersion`, `gitHash`, `buildDate`, `environment`
   - `serverHost` (hostname), `serverIp` (best-effort)
   - `deploySource`: `"manual"`
   - `deployedByUserId`: current admin user

Deploy records are deduplicated by `(appVersion, gitHash, environment)`; re-registering the same triple updates the existing row.

## Viewing deploy history

- Same page: **Deploy History** table with pagination and filter by **environment** (production / staging / local).
- Columns: Date, Version, Git Hash, Build Date, Environment, Host, Source, By, Notes.

## Release notes (Admin)

- **Release notes** are human changelog entries (version, title, markdown notes).
- Create / edit / delete from **Admin → Version & Deploys**.
- **Publish** toggle controls visibility; notes are stored as markdown and shown as plain preview in the table (no raw HTML).

## cURL examples

**Get current version (public):**

```bash
curl -s http://localhost:3000/api/version
```

**Register current deploy (requires admin session cookie):**

```bash
curl -s -X POST http://localhost:3000/api/admin/deploys/register \
  -H "Content-Type: application/json" \
  -H "Cookie: dt_session=YOUR_SESSION_COOKIE" \
  -d '{"notes":"Deployed after hotfix"}'
```

## CI deploy (GitHub Actions)

On **push to `main`** or **manual workflow_dispatch**, the `.github/workflows/deploy.yml` workflow:

1. **Bumps patch version** (e.g. 1.2.0 → 1.2.1), commits with `[skip ci]`, and pushes.
2. **Deploys via SSH**: `git pull`, `npm ci`, `prisma migrate deploy`, build with version/git/date env set, then `pm2 reload`.
3. **Registers the deploy** by calling the internal endpoint (no admin session).

**Required GitHub repo secrets:** `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `APP_DIR`, `DEPLOY_REGISTER_SECRET`.  
**Optional:** `SSH_PORT` (default 22), `DEPLOY_PUBLIC_BASEURL` (default `https://dhtasks.com`), `HEALTHCHECK_URL`.

**Server:** Set the same `DEPLOY_REGISTER_SECRET` in `.env.production` (or env loaded by PM2) and `APP_ENV=production` so the app and internal endpoint behave correctly.

## Internal deploy register (machine-to-machine)

- **POST** `/api/internal/deploy/register` — no cookies; auth via header `x-deploy-secret` equal to `DEPLOY_REGISTER_SECRET`.
- Missing or wrong secret → **401**.
- Creates/updates a **DeployRecord** with `deploySource: "github"`; dedupe by `(appVersion, gitHash, environment)`.
- Used by CI after deploy; do not expose the secret.

## Multi-boutique / security

- Version and deploy data are **global** (no boutique scope). Only **ADMIN** can access admin endpoints and the Version & Deploys page.
- No secrets are exposed in `/api/version` or in the UI.
