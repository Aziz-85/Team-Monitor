# STRICT PATCH MODE — Discovery Summary (Phase 0)

## 1) Auth / session user loader

| Location | Purpose |
|----------|---------|
| **lib/auth.ts** | `getSessionUser()` — reads cookie `dt_session` (value = userId), loads User from DB with `employee: { name, language }`. No boutiqueId on User currently. |
| **app/api/auth/login/route.ts** | Validates credentials, sets cookie via `setSessionCookie(user.id)`. Does NOT check or set boutique. |
| **app/api/auth/session/route.ts** | GET: returns `user.id`, `empId`, `role`, `mustChangePassword`, `name`, `language`, `canEditSchedule`, `canApproveWeek`. No boutiqueId. |
| **middleware.ts** | Protects routes; no boutique logic. |
| No next-auth; custom cookie-based session. |

## 2) Operational scope selector

| Location | Purpose |
|----------|---------|
| **lib/scope/operationalScope.ts** | `getOperationalScope()`, `requireOperationalScope()` — call `resolveOperationalBoutiqueId(userId, role, null)`. |
| **lib/scope/requireOperationalBoutique.ts** | Wraps `requireOperationalScope()`; returns `{ ok, boutiqueId, boutiqueLabel }` or 403. |
| **lib/boutique/resolveOperationalBoutique.ts** | Resolves boutique from: UserPreference.operationalBoutiqueId (ADMIN/MANAGER), Employee.boutiqueId (others), memberships, DEFAULT_BOUTIQUE_ID. Supports “requested” boutique for switching. |
| **app/api/me/operational-boutique/route.ts** | GET: current operational boutique + list; POST: set operational boutique (ADMIN/MANAGER). |
| **app/api/me/scope/route.ts** | GET/POST: scope preference (BOUTIQUE/REGION/GROUP); used for admin scope selector. |
| **components/scope/OperationalBoutiqueSelector.tsx** | UI: dropdown to switch operational boutique (when canSelect). Used in Sidebar + MobileTopBar. |
| **components/scope/ScopeSelector.tsx** | UI: scope selector (boutique/region/group). Used where? (admin/filter contexts.) |
| **components/nav/Sidebar.tsx** | Renders “Working on:” + `OperationalBoutiqueSelector` (when not under /admin). |
| **components/nav/MobileTopBar.tsx** | Renders `OperationalBoutiqueSelector`. |

## 3) Admin boutique filter usage

| Location | Usage |
|----------|--------|
| **app/api/tasks/export-weekly/route.ts** | `request.nextUrl.searchParams.get('boutiqueId')` for ADMIN. |
| **app/api/admin/generate-employee-targets/route.ts** | `adminFilterBoutiqueId = searchParams.get('boutiqueId')?.trim() ?? null`. |
| **app/api/admin/targets/route.ts** | `adminFilterBoutiqueId = searchParams.get('boutiqueId')?.trim() ?? null`. |
| **app/api/admin/boutique-target/route.ts** | Uses SystemConfig `DEFAULT_BOUTIQUE_ID` for default. |
| **app/api/admin/sales/repair/route.ts** | `boutiqueId: url.searchParams.get('boutiqueId') || null`. |
| **app/api/admin/memberships/route.ts** | `boutiqueId = searchParams.get('boutiqueId')?.trim()`. |
| **app/api/admin/employees/route.ts** | `boutiqueId = searchParams.get('boutiqueId')?.trim()`. |
| **app/api/admin/users/route.ts** | `boutiqueId = searchParams.get('boutiqueId')?.trim()`. |
| **app/api/kpi/uploads/route.ts** | `boutiqueId = searchParams.get('boutiqueId') ?? undefined`. |

## 4) DEFAULT_BOUTIQUE_ID usage

- **prisma/schema.prisma** — SystemConfig key described.
- **lib/boutique/resolveOperationalBoutique.ts** — Fallback when resolving operational boutique.
- **lib/scope/resolveScope.ts**, **lib/scope/effectiveBoutique.ts**, **lib/audit.ts**, **lib/admin/audit.ts**, **lib/sales-target-audit.ts** — Various fallbacks.
- **app/api/admin/sales-import/route.ts**, **app/api/admin/system/default-boutique/route.ts** — Admin/system.
- **scripts/backfill-*.ts**, **prisma/seed.ts** — Backfill/seed only.

---

**Schema note:** `User` model has no `boutiqueId`; scope is derived from UserPreference.operationalBoutiqueId + resolveOperationalBoutiqueId. Phase 1 will add required `User.boutiqueId` and backfill.

**Targets uniques:** Already applied: `BoutiqueMonthlyTarget` @@unique([boutiqueId, month]), `EmployeeMonthlyTarget` @@unique([boutiqueId, month, userId]).
