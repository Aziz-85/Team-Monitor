# Stage 5: RBAC Hardening and Route Access Consistency — Plan

## 1. Audit summary

### Middleware (middleware.ts)
- **Current auth check:** `isAuthRequired(pathname)` returns true only for: `/`, `/employee`, `/schedule`, `/tasks`, `/planner-export`, `/change-password`, `/admin`, `/area`.
- **Gap:** `/dashboard`, `/about`, `/sales/*`, `/boutique/*`, `/kpi/*`, `/approvals`, `/leaves`, `/inventory/*`, `/me/*`, `/sync/*` are **not** in the list, so unauthenticated requests to these paths are not redirected to login at middleware level. They still hit the (dashboard) layout, which calls `getSessionUser()` and redirects to `/login` — so protection exists but is not at the edge.
- **Matcher:** Config includes `/(dashboard)/:path*`; in Next.js the request pathname is the URL path (e.g. `/dashboard`), so route-group folder names do not appear. Thus `/dashboard`, `/about`, `/sales/…` may not match the current matcher. Matcher already has `/approvals`, `/leaves`, `/inventory/:path*`, `/me/:path*`, `/sync/:path*`, `/executive`, `/executive/:path*`. **Missing from matcher:** `/dashboard`, `/about`, `/sales`, `/sales/:path*`, `/boutique`, `/boutique/:path*`, `/kpi`, `/kpi/:path*`.

### Layout (app/(dashboard)/layout.tsx)
- Requires `getSessionUser()`; redirects to `/login` if no user; redirects to `/login?error=no_boutique` when user has no boutique (except SUPER_ADMIN, DEMO_VIEWER). **No change.**

### RouteGuard (components/RouteGuard.tsx)
- Client-side: uses `canAccessRoute(role, pathname)` (from `lib/permissions.ts` ROLE_ROUTES). Redirects DEMO_VIEWER to `/dashboard`, EMPLOYEE/ASSISTANT_MANAGER to `/employee`, others to `/`. **Kept for UX; not the only protection.**

### Page-level guards
- All sensitive pages reviewed have server-side `getSessionUser()` + role/scope checks and `redirect()`. Executive, admin, reports, inventory follow-up/history, approvals, sales, targets — all protected. **No new page guards required.**

### ROLE_ROUTES (lib/permissions.ts)
- Used by RouteGuard and canAccessRoute. DEMO_VIEWER still lists `/executive*` and `/kpi/upload`; server pages redirect them. Aligning ROLE_ROUTES with nav (remove DEMO_VIEWER from executive and kpi/upload) avoids RouteGuard allowing then page redirecting; **optional** for Stage 5 (minimal scope). Omitted from this pass; can be a follow-up.

---

## 2. Hardening plan

### 2.1 Middleware: require auth for all app routes
- **Change:** `isAuthRequired(pathname)`: treat any path that is not public and not API as requiring auth.
  - Before: explicit list (/, /employee, /schedule, /tasks, /planner-export, /change-password, /admin, /area).
  - After: `return true` for any path that is not `isPublic` and not `/api`.
- **Effect:** Unauthenticated requests to `/dashboard`, `/about`, `/sales/*`, `/boutique/*`, `/kpi/*`, etc. are redirected to `/login` at middleware before hitting the layout.

### 2.2 Middleware: extend matcher so all app routes run middleware
- **Change:** Add to `config.matcher`: `/dashboard`, `/dashboard/:path*`, `/about`, `/sales`, `/sales/:path*`, `/boutique`, `/boutique/:path*`, `/kpi`, `/kpi/:path*` so middleware runs for these pathnames.
- **Effect:** Auth check and redirect apply to these paths; no new redirect logic beyond `isAuthRequired` + session check.

### 2.3 No other changes
- Layout: unchanged.
- RouteGuard: unchanged.
- Page guards: unchanged.
- ROLE_ROUTES: unchanged (optional alignment in a later pass).
- No route renames, no DB, no business logic.

---

## 3. Files to change

| File | Change |
|------|--------|
| `middleware.ts` | (1) `isAuthRequired`: return `true` for all non-public, non-API paths. (2) Add to matcher: `/dashboard`, `/dashboard/:path*`, `/about`, `/sales`, `/sales/:path*`, `/boutique`, `/boutique/:path*`, `/kpi`, `/kpi/:path*`. |

---

## 4. Middleware coverage before/after

| Path prefix | Before (auth at middleware) | After |
|-------------|-----------------------------|--------|
| `/`, `/employee`, `/schedule`, `/tasks`, `/planner-export`, `/change-password`, `/admin`, `/area` | Yes | Yes |
| `/dashboard`, `/about`, `/sales/*`, `/boutique/*`, `/kpi/*` | No (layout only) | Yes |
| `/approvals`, `/leaves`, `/inventory/*`, `/me/*`, `/sync/*`, `/executive/*` | No (layout only) | Yes (once matcher + isAuthRequired updated) |

---

## 5. Rollback
- Revert `middleware.ts`: restore explicit list in `isAuthRequired` and remove the added matcher entries. Layout continues to enforce auth for all dashboard routes.

---

## 6. Applied (Stage 5)

- **middleware.ts:** `isAuthRequired()` now returns `true` for any path that is not public and not `/api`, so all app routes require a session at the edge. Matcher extended with `/dashboard`, `/dashboard/:path*`, `/about`, `/sales`, `/sales/:path*`, `/boutique`, `/boutique/:path*`, `/kpi`, `/kpi/:path*`, and `/leaves/:path*`. No changes to layout, RouteGuard, or page-level guards.

---

## 7. Intentional exceptions
- `/api/*`: no middleware redirect; handlers enforce auth.
- `/login`: public; no session required.
- DEMO_VIEWER write-block: unchanged (mutations 403 in middleware).
- FEATURES.EXECUTIVE: unchanged (executive routes 404/redirect when disabled).
