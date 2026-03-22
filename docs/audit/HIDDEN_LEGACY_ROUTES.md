# Hidden / legacy / alias routes (governance)

This document classifies routes that are **not** prominent in the sidebar or exist as **aliases**, so future changes do not treat them as accidental omissions.

| Route | Classification | Notes |
|-------|----------------|-------|
| `/admin/system-audit` | Hidden but intentional | Deep admin: audit markdown docs. **ADMIN**, **SUPER_ADMIN** only. Not in main nav; linked from administration or direct URL. |
| `/admin/import/monthly-matrix` | LEGACY (nav) | `navConfig`: `LEGACY` + `hiddenFromNav`; entry point is Import Center `/admin/import`. |
| `/sales/import` | Active, linked from nav | Data imports under sales (MANAGER+). |
| `/sales/import-matrix` | Active, not primary nav | Monthly matrix file → SalesEntry; reachable from sales/import flows. |
| `/sales/import-issues` | Active | Import issue queue. |
| `/sales/monthly-matrix` | Active | Grid UI; may overlap admin monthly-matrix import conceptually — both resolve to **SalesEntry** reads. |
| `/targets/boutiques` | Active (AREA_MANAGER scope) | Target management; AREA_MANAGER in `ROLE_ROUTES`. |
| `/targets/employees` | Active | Same family as `/targets`. |
| `/targets/import` | Active | Target import. |
| `/schedule` | Redirect / landing | Often redirects to view or edit depending on product rules. |
| `/planner-export` | Utility / integration | Export path; MANAGER+ in `ROLE_ROUTES`. |
| `/change-password` | Utility | All roles; not grouped under admin. |

**Principles**

- **navConfig** = what the sidebar shows (plus governance types).
- **ROLE_ROUTES** = what `RouteGuard` allows.
- Drift between them is warned in development via `lib/navConsistency.ts`.

**Obsolete candidates**

- Routes that look unused should be flagged in an issue tracker before deletion; **do not** remove in stabilization passes without product sign-off.
