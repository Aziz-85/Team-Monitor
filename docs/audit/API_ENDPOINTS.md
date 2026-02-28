# API Endpoints Reference

**Generated:** 2025-02-14 | **Purpose:** P3 — List API routes and usage (client vs server/internal).

---

## Summary

- **Client-called:** Endpoints that are fetched from dashboard client components (fetch from browser).
- **Server / internal:** Used by server components, redirects, form POSTs, or other API routes. Not necessarily unused.

A full grep of `fetch('/api/...` and `fetch(\`/api/...` was used to mark client-called routes. Endpoints not listed under "Client-called" may still be used by server-side code, middleware, or direct navigation (e.g. download links).

---

## Client-called (from app fetch)

| Prefix / route | Used by |
|----------------|--------|
| `/api/me/operational-boutique` | Schedule view/edit, Home |
| `/api/me/targets` | Home |
| `/api/me/boutiques` | Leave requests |
| `/api/me/scope` | Boutique leaves |
| `/api/home` | Home |
| `/api/schedule/week`, `/api/schedule/week/grid`, `/api/schedule/week/status` | Schedule view/edit/page/editor |
| `/api/schedule/guests`, `/api/schedule/month`, `/api/schedule/month/excel` | Schedule edit/view/page |
| `/api/schedule/insights/week`, `/api/schedule/reminders` | Schedule view |
| `/api/schedule/external-coverage/employees`, `/api/schedule/external-coverage/source-boutiques` | Schedule edit |
| `/api/schedule/week/grid/save`, `/api/schedule/lock`, `/api/schedule/unlock`, `/api/schedule/approve-week`, `/api/schedule/week/unapprove` | Schedule edit |
| `/api/schedule/audit-edits` | Schedule audit-edits page |
| `/api/schedule/month/excel` | Schedule view/edit |
| `/api/overrides`, `/api/overrides/[id]` | Schedule edit/page |
| `/api/audit` | Schedule edit (audit panel) |
| `/api/suggestions/coverage`, `/api/suggestions/coverage/apply` | Home, schedule editor |
| `/api/tasks/list`, `/api/tasks/my-today`, `/api/tasks/completion`, `/api/tasks/monitor`, `/api/tasks/export-weekly` | Tasks pages, Home |
| `/api/leaves`, `/api/leaves/[id]`, `/api/leaves/employees`, `/api/leaves/requests`, `/api/leaves/evaluate`, `/api/leaves/submit`, `/api/leaves/request`, `/api/leaves/approve`, `/api/leaves/escalate`, `/api/leaves/admin-approve`, `/api/leaves/reject` | Leaves pages, boutique leaves |
| `/api/inventory/daily`, `/api/inventory/daily/complete`, `/api/inventory/daily/exclusions`, `/api/inventory/daily/stats`, `/api/inventory/daily/rebalance`, `/api/inventory/daily/recompute` | Inventory daily |
| `/api/inventory/absent`, `/api/inventory/zones/weekly`, `/api/inventory/zones/weekly/complete`, `/api/inventory/zones/weekly/complete-all` | Inventory daily, zones weekly |
| `/api/inventory/follow-up/daily`, `/api/inventory/follow-up/daily/next`, `/api/inventory/follow-up/weekly` | Inventory follow-up |
| `/api/admin/system/default-boutique`, `/api/admin/boutiques` | Admin system page |
| `/api/admin/audit-docs` | Admin system-audit page (P3) |

---

## Server / internal or other entry points

- **Auth:** `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/auth/change-password` — used by login page, middleware, or redirects.
- **Dashboard:** `/api/dashboard` — used by dashboard page (server or client).
- **Sales:** `/api/sales/daily`, `/api/sales/import/export`, `/api/sales/coverage`, `/api/sales/entry`, etc. — used by sales pages (some via server or form).
- **Planner export:** `/api/planner/export`, `/api/planner/export/schedule`, `/api/sync/planner/export`, `/api/sync/planner/export/v2` — used by planner-export and sync/planner pages (download links).
- **Admin:** All `/api/admin/*` not listed above — used by admin pages (forms, tables, or server).
- **Executive, KPI, approvals, employees, etc.** — used by corresponding pages.

No endpoints were removed. Unused or rarely used routes can be revisited in a later cleanup; this doc serves as a reference.
