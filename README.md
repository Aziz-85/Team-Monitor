# Team Monitor

Operational scheduling and task management for managers and employees.

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript** (strict)
- **Prisma** + **PostgreSQL**
- **Tailwind CSS**
- Cookie-based auth (HTTP-only), username = EmpID, bcrypt
- i18n: Arabic / English with RTL/LTR

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create `.env` in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
```

Example for local PostgreSQL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dhahran_team?schema=public"
```

### 3. Database

```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

**After pulling:** Run `npx prisma migrate deploy` to apply pending migrations (including the CoverageRules policy fix). Then `npm run db:seed` if needed for a fresh DB.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login`.

- **Custom port:** `PORT=3001 npm run dev` (Unix) or `set PORT=3001 && npm run dev` (Windows).
- **LAN access:** The dev server binds to `0.0.0.0`; Next.js prints a Network URL (e.g. `http://192.168.x.x:3000`). Use `npm run dev:lan` for port 3001.

### Seed admin user

- **Username (Emp ID):** `admin`
- **Password:** `Admin@123`
- **Role:** ADMIN  
- You will be prompted to change password on first login.

## Scripts

| Script        | Description                |
|---------------|----------------------------|
| `npm run dev` | Start dev server           |
| `npm run dev:lan` | Dev server on port 3001, bind 0.0.0.0 for LAN access |
| `npm run build` | Production build         |
| `npm run start` | Start production server  |
| `npm run lint` | Run ESLint               |
| `npm run db:generate` | Prisma generate   |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed database        |
| `npm test` | Run tests (minimal)      |
| `npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/verify-sales-targets.ts [monthKey] [date]` | Verify week/month intersection and week target (e.g. `... 2026-02 2026-02-28`) |

## System overview

This app solves **operational scheduling and task/inventory management** for a team with a weekly roster (Saturday–Friday), day overrides, Rashid Boutique coverage, and role-based access. Managers see and edit the full schedule; employees see their own. Counts (boutique AM/PM, Rashid coverage) are computed from a single source of truth and must stay consistent between View and Editor.

## Schedule logic summary

- **Base shifts:** By team (A/B) and week parity: even week Team A AM / Team B PM, odd week swapped. **Friday has no morning shift** (boutique PM-only).
- **Overrides:** Stored per employee per day (MORNING, EVENING, NONE, COVER_RASHID_AM, COVER_RASHID_PM). Override wins over base.
- **Availability:** WORK | LEAVE | OFF | ABSENT (from leaves, weekly off day, inventory absent). Only **WORK** cells contribute to any count.
- **Counts:** Boutique AM = WORK + effectiveShift MORNING; Boutique PM = WORK + effectiveShift EVENING. Rashid AM/PM = WORK + COVER_RASHID_AM / COVER_RASHID_PM. Coverage shifts are **excluded** from boutique counts.
- **Single source of truth:** `lib/services/scheduleGrid.ts` — `getScheduleGridForWeek` builds rows/cells and counts; `computeDayCountsFromCells` / `computeCountsFromGridRows` define count rules. All views and the week grid API consume this. Do not duplicate counting logic elsewhere.

## Roles and permissions

- **EMPLOYEE:** Schedule view (read-only, own or full depending on route), own tasks, own inventory. **Cannot** open Schedule Editor or call override/grid save APIs (403).
- **MANAGER / ASSISTANT_MANAGER:** Full schedule view and edit, overrides, coverage, tasks, planner export, leaves, inventory. Cannot change system rules or users.
- **ADMIN:** Full access including users, employees, coverage rules, import.

RBAC is enforced server-side; see `docs/RBAC_MATRIX.md`. No write API is callable by EMPLOYEE.

## Main pages

- **Public:** `/login`, `/change-password`
- **Employee:** `/employee` (home: today schedule, today tasks, week roster)
- **Manager/Admin:** `/` (today operations), `/schedule`, `/schedule/editor`, `/tasks`, `/tasks/setup`, `/planner-export`
- **Admin:** `/admin/employees`, `/admin/users`, `/admin/coverage-rules`, `/admin/import`, `/admin/audit/login`

### Login Audit Log (Admin only)

Every login attempt (success/failure) and every logout is recorded in the **Auth Audit Log**. Only users with role **ADMIN** can view it.

- **Page:** `/admin/audit/login` — table with pagination, filters by event type (LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT), date range (last 7/30/90 days), and search by email/username attempted.
- **API:** `GET /api/admin/auth-audit` — query params: `page`, `pageSize`, `event`, `q`, `from`, `to`. Requires ADMIN role.
- **Data stored:** event, userId (if known), emailAttempted, IP (from `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`), user-agent, device hint (mobile/desktop), reason (e.g. INVALID_PASSWORD, USER_NOT_FOUND, BLOCKED). Passwords are never stored.
- **Retention:** Optional `npm run audit:retention` deletes logs older than 180 days (override with `AUTH_AUDIT_RETENTION_DAYS=90`). Schedule via cron; do not auto-run.

## Sales targets and daily sales

- **Targets:** Boutique monthly target is set per month (YYYY-MM). Employee monthly targets are **weighted by role** (not equal split). Weights: Manager 0.5, Assistant Manager 0.75, High Jewellery Expert 2.0, Senior Sales Advisor 1.5, Sales Advisor 1.0. Formula: `EmployeeMonthlyTarget = BoutiqueMonthlyTarget × (employeeWeight / sumWeightsOfActiveEmployees)`. Remainder (from flooring) is distributed deterministically by empId then email. Active = User not disabled, Employee active, not system-only. Role comes from `Employee.salesTargetRole` or is derived from `Employee.position`.
- **Pages:** `/admin/targets` (Manager/Admin: set boutique target, generate/regenerate employee targets, upload sales, override employee target); `/me/target` (own targets and sales entry). Home shows today target and monthly progress cards when the user has a target or any sales.
- **Sales entry policy:** Users can create/update/delete sales only for **today and yesterday** (Riyadh). Manager/Admin can for any date. Week starts Saturday; month and “today” use Asia/Riyadh.

### Importing sales (two modes)

1. **Simple (date, email, amount):** Use any sheet with columns **date** (YYYY-MM-DD), **email** (must match an existing employee email), **amount** (numeric). First row = header. Each row upserts one SalesEntry for that user+date.
2. **MSR Data Sheet (empId columns):** Use a sheet named **Data** (case-insensitive) with MSR layout:
   - **Fixed columns:** Quarter, Week, **Date**, … **Total Sale After**.
   - **Employee columns:** Every column *after* "Total Sale After" is an **employee column**; the header must be the **Employee ID (empId)** matching `Employee.empId` in the system (string or numeric). Names and emails are not used for MSR import.
   - **Date parsing:** Supports Excel date serials, "YYYY-MM-DD", and short forms like "1-Jan" (year inferred from the import month parameter).
   - **Validation:** For each row, the sum of employee amounts is compared to "Total Sale After"; if the absolute difference is &gt; 1 SAR, a warning is added.
   - When using MSR mode, pass **month** (YYYY-MM) in the import form so the year can be inferred for dates without a year.

Import response: `importedCount`, `updatedCount`, `skippedCount`, `skipped[]` (rowNumber, empId?, columnHeader?, reason), `warnings[]` (rowNumber, date, totalAfter, sumEmployees, delta). Only Admin/Manager can import.

### Sales Ledger + Guest Coverage + Returns/Exchanges + RBAC

Row-level **Sales Ledger** (`SalesTransaction`) supports employee transfers without breaking historical sales, **cross-boutique guest coverage** attribution (sales at host boutique attributed to covering employee; stored at write time via `ShiftOverride`), and **Returns/Exchanges** as auditable ledger rows with optional link to original sale. All amounts in **INT halalas** (SAR×100). Dates in **Asia/Riyadh**. No hard deletes; corrections via new MANUAL transactions only (feature flag).

**RBAC (sales APIs):**

- **EMPLOYEE:** Own sales only (summary, ledger, returns) within active boutique; no import, no resolve.
- **ASSISTANT_MANAGER:** Full boutique summary, ledger, returns, import-issues (read-only); no import, no resolve.
- **MANAGER:** Full boutique + import ledger + resolve import issues for active boutique only.
- **ADMIN:** Cross-boutique; optional `boutiqueId` filter; import and resolve any.

**APIs:** `GET /api/sales/summary`, `GET /api/sales/ledger`, `GET /api/sales/returns`, `POST /api/sales/import-ledger`, `GET /api/sales/import-issues`, `PATCH /api/sales/import-issues/:id`. All enforce session role and active boutique before querying.

**Pages:** `/sales/my` (EMPLOYEE), `/sales/summary`, `/sales/returns`, `/sales/import`, `/sales/import-issues`. Nav items gated by role in `lib/navConfig.ts`.

**Verification (manual):**

1. **Guest coverage:** Create a `ShiftOverride` for employee E at host boutique H on date D; import a sale row for H, E, D → `SalesTransaction` has `isGuestCoverage=true`, `coverageSourceBoutiqueId`, `coverageShift` set.
2. **Historical transfer:** Import a sale for an employee who later moved boutiques → sale remains in host boutique summary (boutiqueId = host).
3. **Return linkage:** Import a RETURN row with `originalReference` matching an existing SALE `referenceNo` → `originalTxnId` set; net sales decrease; row appears in returns ledger.
4. **EMPLOYEE visibility:** As EMPLOYEE, call summary/ledger/returns → only own rows returned.
5. **MANAGER vs ADMIN import:** MANAGER can POST import-ledger only when `boutiqueId` = active boutique; ADMIN can POST for any `boutiqueId`.

### Delegation overlay — how it works

**Delegation** is a time-bounded permission overlay. Baseline role and permissions are unchanged; **effective** permissions = baseline + active delegation grants (where `revokedAt` is null and now is within `[startsAt, endsAt]`). When a grant expires or is revoked, the user reverts to baseline immediately (no cron).

- **Models:** `DelegationGrant` (boutique-scoped, type ROLE_BOOST or PERMISSION_FLAGS, startsAt/endsAt, reason, revoke fields), `DelegationAuditLog` (GRANT_CREATE / GRANT_REVOKE).
- **Resolver:** `lib/rbac/effectiveAccess.ts` — `getEffectiveAccess(user, boutiqueId)` returns `effectiveRole` (max of baseline and roleBoost), `effectiveFlags` (baseline merged with grant flags; true wins). Used by session (so UI sees effective canEditSchedule/canApproveWeek), leave approval, and schedule approve-week.
- **Who can grant:** ADMIN for any boutique; MANAGER only for their boutique and only up to MANAGER (no ADMIN boost). Cannot grant to self. Max duration 30 days.
- **APIs:** `GET /api/admin/delegations?boutiqueId=&status=`, `POST /api/admin/delegations` (create), `POST /api/admin/delegations/:id/revoke` (body: `{ reason }`).
- **Page:** `/admin/control-panel/delegation` — list Active / Scheduled / Expired, create form (target user, ROLE_BOOST or PERMISSION_FLAGS, start/end, reason), revoke with reason.

**Verification checklist:**

1. **Baseline unchanged:** With no grants, effective role and flags match baseline; leave/schedule behavior unchanged.
2. **Create grant:** As MANAGER, create ROLE_BOOST=MANAGER for an ASSISTANT_MANAGER for a 7-day window → that user’s session returns effectiveRole MANAGER and canApproveWeek true within the window; they can approve leaves and approve week for that boutique.
3. **Expiry:** After endsAt, effective access reverts; session and leave/schedule APIs deny again.
4. **Revoke:** Revoke a grant with reason → revokedAt set; effective access stops immediately; DelegationAuditLog has GRANT_REVOKE.
5. **Logs:** DelegationAuditLog shows who granted/revoked, target user, and metadata (grantId, type, reason).

## Production deployment (Ubuntu + PM2)

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for one-time setup and the `deploy-team-monitor` command. Deploy runs as user `deploy`, with DB backup before migrations, rollback path, and daily backup cron.

## API (summary)

- **Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/change-password`
- **Home:** `GET /api/home?date=`, `GET /api/employee/home?date=`
- **Schedule:** `GET /api/schedule/week?weekStart=`, `GET /api/schedule/month?month=`, `POST /api/overrides`, `PATCH /api/overrides/[id]`
- **Tasks:** `GET /api/tasks/day?date=`, `GET /api/tasks/range?from=&to=`, `GET/POST /api/tasks/setup`, etc.
- **Planner:** `POST /api/planner/export` (body: `{ from, to }`, returns CSV)
- **Admin:** `GET/POST /api/admin/users`, `GET/POST /api/admin/employees`, `GET/PATCH /api/admin/coverage-rules`, `POST /api/admin/import`, `GET /api/admin/targets?month=`, `POST /api/admin/boutique-target`, `POST /api/admin/generate-employee-targets?regenerate=`, `PATCH /api/admin/employee-target`, `POST /api/admin/sales-import` (multipart .xlsx), `GET /api/admin/delegations?boutiqueId=&status=`, `POST /api/admin/delegations`, `POST /api/admin/delegations/:id/revoke`
- **Me:** `GET/POST /api/me/sales`, `DELETE /api/me/sales/[id]`, `GET /api/me/targets?month=`

## Known constraints / assumptions

- Week starts **Saturday** (weekStart = Saturday YYYY-MM-DD).
- **Friday:** No MORNING or COVER_RASHID_AM; server rejects/skips them; UI hides AM options on Friday.
- **وضع رمضان (Ramadan):** الدوام كالمعتاد (صباحي + مساء)، مع إضافة دوام الفترة الصباحية ليوم الجمعة. أضف في `.env` (سنة 2026 فقط):
  - `RAMADAN_START=YYYY-MM-DD` (مثال: 2026-01-16)
  - `RAMADAN_END=YYYY-MM-DD` (مثال: 2026-03-21)
  يظهر شريط "وضع رمضان: الدوام كالمعتاد + صباحي الجمعة" عند عرض/تعديل أسبوع داخل الفترة، ويُسمح في رمضان باختيار دوام صباحي ليوم الجمعة.
- Month view uses `rosterForDate` (separate from week grid); week schedule is the single source for the grid.
- Validation: PM ≥ AM and PM ≥ 2 (Sat–Thu); Friday AM-only (PM = 0, AM ≥ 2). Min AM informational. Warnings shown in Editor and View.

## How to safely modify schedule logic

1. **Counts or effectiveShift rules:** Change only in `lib/services/scheduleGrid.ts` (`computeDayCountsFromCells`, `computeCountsFromGridRows`, or the grid builder). Run `__tests__/schedule-counts.test.ts` after changes.
2. **Friday rule:** `lib/services/shift.ts` — `isAmShiftForbiddenOnDate`; keep overrides and grid/save aligned.
3. **New validation or errors:** Add keys to `lib/validationErrors.ts` and i18n; surface to user (toast or inline), no silent failures.
4. **New API or role:** Update `docs/RBAC_MATRIX.md` and use `requireRole` server-side.

## Production / Troubleshooting

- **Database auth error on server:** If you see `Authentication failed... credentials for ... are not valid` or `localhost ... abdulazizalnasser`, the app is using the wrong `DATABASE_URL`. On the server, ensure `.env` has the **production** database URL (user, password, and host for the real DB), not a local/dev URL. Then restart the app (e.g. `pm2 restart team-monitor`).
- **"Failed to find Server Action" in logs:** Usually caused by an old cached page after a new deployment. Users should do a **hard refresh** (Ctrl+Shift+R / Cmd+Shift+R) or clear site data for the app URL. No code change needed.
- **"Cookies can only be modified in a Server Action or Route Handler":** This can appear when reading session in a Server Component; the app now treats it as expected and does not log it.

## Tests

- **Schedule counts & Friday:** `__tests__/schedule-counts.test.ts` — count rules, Friday blocking, consistency (same input ⇒ same counts).
- **RBAC:** `__tests__/rbac-schedule.test.ts` — `canEditSchedule` and contract that EMPLOYEE cannot call write APIs.
- **API 403 contract:** `__tests__/api-403.test.ts` — documents expected 401/403 behavior.
- **Tasks:** `__tests__/tasks.test.ts` — task schedule logic.

Run: `npm test`
