# Admin Pages Map (Pre–IA Refactor)

**Generated for STRICT ADMIN IA REFACTOR. No feature changes.**

## A) Current admin nav groups and items (from lib/navConfig.ts)

**ADMINISTRATION** (single flat group):
- /admin/boutiques — Boutiques
- /admin/regions — Regions
- /admin/boutique-groups — Boutique Groups
- /admin/memberships — Memberships
- /admin/control-panel/delegation — Delegation
- /admin/system — System Settings
- /admin/system/version — Version & Deploys
- /admin/system-audit — System Audit
- /admin/audit/login — Login Audit
- /admin/employees — Employees
- /admin/reset-emp-id — Reset employee number
- /admin/reset-password — Reset password
- /admin/users — Users
- /admin/coverage-rules — Coverage Rules
- /admin/kpi-templates — KPI Templates
- /admin/import — Import
- /admin/import/month-snapshot — Monthly Snapshot
- /admin/historical-import — Historical Import

**SALES** (mixed manager + admin):
- /admin/targets — Targets (MANAGER+)
- /admin/sales-edit-requests — Sales edit requests (MANAGER+)
- /sales/import — Import Sales (MANAGER+)
- /sales/import-matrix — Monthly Import Matrix (MANAGER+)
- /sales/import-issues — Import Issues (ASSISTANT_MANAGER+)

## B) All routes under /admin (from app directory)

| Route | File | RBAC (server) |
|-------|------|----------------|
| /admin/boutiques | admin/boutiques/page.tsx | (nav: ADMIN, SUPER_ADMIN) |
| /admin/boutiques/[id] | admin/boutiques/[id]/page.tsx | — |
| /admin/regions | admin/regions/page.tsx | — |
| /admin/boutique-groups | admin/boutique-groups/page.tsx | — |
| /admin/memberships | admin/memberships/page.tsx | — |
| /admin/control-panel/delegation | admin/control-panel/delegation/page.tsx | — |
| /admin/system | admin/system/page.tsx | — |
| /admin/system/version | admin/system/version/page.tsx | — |
| /admin/system-audit | admin/system-audit/page.tsx | — |
| /admin/audit/login | admin/audit/login/page.tsx | — |
| /admin/employees | admin/employees/page.tsx | — |
| /admin/reset-emp-id | admin/reset-emp-id/page.tsx | — |
| /admin/reset-password | admin/reset-password/page.tsx | — |
| /admin/users | admin/users/page.tsx | — |
| /admin/coverage-rules | admin/coverage-rules/page.tsx | — |
| /admin/kpi-templates | admin/kpi-templates/page.tsx | — |
| /admin/import | admin/import/page.tsx | ADMIN, SUPER_ADMIN (server redirect) |
| /admin/import/month-snapshot | admin/import/month-snapshot/page.tsx | ADMIN, SUPER_ADMIN |
| /admin/historical-import | admin/historical-import/page.tsx | ADMIN, SUPER_ADMIN |
| /admin/targets | admin/targets/page.tsx | — |
| /admin/sales-edit-requests | admin/sales-edit-requests/page.tsx | — |

## C) Duplicates / confusing labels / scattered import-related pages

- **Import scattered**: Import entry is /admin/import; Sales Import is under /sales/import; Monthly Snapshot under /admin/import/month-snapshot; Historical under /admin/historical-import; Import Issues under /sales/import-issues. No single mental model.
- **Labels**: "Monthly Snapshot" vs "Historical Import" vs "Import Sales" — inconsistent naming (some "Import X", some "X Import").
- **No central Import dashboard**: /admin/import currently mixes one inline form (matrix) with two links (Month Snapshot, Sales Import); Historical Import is a separate top-level admin item.
- **Duplicate entry points**: Sales nav shows "Import Sales", "Monthly Import (Matrix)", "Import Issues"; Admin shows "Import", "Monthly Snapshot", "Historical Import". Overlap and confusion.

## Target (post–refactor)

- **ADMINISTRATION**: Users & Roles, Access/Permissions, Audit Logs, System Settings, Version/Build Info + Boutiques, Regions, Boutique Groups, Memberships, Delegation, Employees, Reset Emp ID, Reset Password, Coverage Rules, KPI Templates.
- **IMPORT**: One group with Import Dashboard (/admin/import) and subpages: Sales (/admin/import/sales → /sales/import), Targets/Month Snapshot (/admin/import/month-snapshot), Historical (/admin/import/historical), Import Issues (/admin/import/errors → /sales/import-issues), Monthly Matrix (/admin/import/matrix). Old URLs /admin/historical-import and /admin/import/sales, /admin/import/errors via redirects.
