# Dynamic Data & Caching Audit

**Generated:** 2025-02-14 | **Purpose:** Identify pages/APIs that may serve stale data.

---

## Pages — Dynamic vs Static

| Page | dynamic export | Verdict | Notes |
|------|----------------|---------|-------|
| `/dashboard` | `force-dynamic` | ✅ Dynamic & Fresh | `app/(dashboard)/dashboard/page.tsx` line 5 |
| All other pages | None | ⚠️ Potentially stale | Next.js default: dynamic if fetch used, static if not. Client components use fetch() — no cache control. |

**Key finding:** Only `/dashboard` explicitly declares `export const dynamic = 'force-dynamic'`. Other pages rely on Next.js heuristics. Since most pages use **client components** that call `fetch()` at runtime, they are effectively dynamic (data fetched on each visit). Server components that fetch data without `dynamic` could be cached.

---

## Pages with Server-Side Data Fetch

| Page | Fetches on server? | Cache risk |
|------|--------------------|------------|
| `/dashboard` | Yes (via layout or page) | ✅ force-dynamic |
| `/` | Redirect only | N/A |
| `/schedule/edit` | getRamadanRange() only | Low (config) |
| `/schedule/view` | fullGrid, ramadanRange from page | Check page.tsx |
| `/login` | None | N/A |
| `/change-password` | None | N/A |

**Most pages:** Data is fetched in **client components** via `fetch()`. No server-side caching of fetch. Browser may cache fetch by default — clients should use `cache: 'no-store'` for critical data.

---

## Client Fetch — Cache Usage

| File | Endpoint | cache: 'no-store'? |
|------|----------|-------------------|
| `MonthlySalesMatrixClient.tsx` | /api/sales/monthly-matrix | ✅ Yes (line 59) |
| `ExecutiveDashboard.tsx` | /api/sales/monthly-matrix | ✅ Yes (line 95) |
| Other clients | Various | ❌ Default (no explicit cache) |

**Recommendation:** Add `cache: 'no-store'` to fetch calls for:
- Schedule grid, week status, guests
- Sales daily, monthly matrix
- Dashboard, executive
- Tasks, inventory, leaves

---

## API Routes — force-dynamic

| API | dynamic | File |
|-----|---------|------|
| /api/dashboard | ✅ force-dynamic | `app/api/dashboard/route.ts` |
| /api/sales/monthly-matrix | ✅ force-dynamic | `app/api/sales/monthly-matrix/route.ts` |
| /api/sales/daily | ✅ force-dynamic | `app/api/sales/daily/route.ts` |
| /api/sales/daily/summary | ✅ force-dynamic | `app/api/sales/daily/summary/route.ts` |
| /api/executive/monthly | ✅ force-dynamic | `app/api/executive/monthly/route.ts` |
| /api/admin/sales/validate | ✅ force-dynamic | `app/api/admin/sales/validate/route.ts` |
| /api/admin/sales/repair | ✅ force-dynamic | `app/api/admin/sales/repair/route.ts` |
| /api/debug/sales/raw | ✅ force-dynamic | `app/api/debug/sales/raw/route.ts` |
| /api/version | ✅ force-dynamic | `app/api/version/route.ts` |
| /api/health | ✅ force-dynamic, revalidate: 0 | `app/api/health/route.ts` |

**APIs without force-dynamic:** ~145 routes. Next.js default for Route Handlers is dynamic when using cookies/headers. Since auth uses cookies, most routes are dynamic. Explicit `force-dynamic` recommended for critical data APIs (schedule, sales, inventory).

---

## Summary

| Category | Count | Verdict |
|----------|-------|---------|
| Pages with force-dynamic | 1 | ⚠️ Add to critical pages if server-rendered |
| Pages (client fetch only) | 51 | ✅ OK as long as client fetch is not cached |
| APIs with force-dynamic | 10 | ✅ Critical sales/executive covered |
| APIs without | ~145 | ⚠️ Rely on Next.js default (dynamic when cookies used) |

**Top risk:** Client fetch without `cache: 'no-store'` may use browser cache. Add to schedule, tasks, inventory, leaves fetch calls.
