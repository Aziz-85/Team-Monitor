# Team Monitor — Website Map

A single reference for all pages and routes. Roles: **EMPLOYEE**, **ASSISTANT_MANAGER**, **MANAGER**, **ADMIN**, **SUPER_ADMIN**.  
Some links require extra permissions (e.g. schedule edit, approve week).

---

## Public (no login)

| Path | Description |
|------|--------------|
| **/login** | Sign in |

---

## Auth (after login)

| Path | Description |
|------|--------------|
| **/change-password** | Change password (when required) |

---

## Operations (العمليات)

| Path | Roles | Description |
|------|-------|-------------|
| **/** | MANAGER, ADMIN, SUPER_ADMIN | Home — today’s roster, coverage, tasks |
| **/dashboard** | All | Main dashboard |
| **/employee** | EMPLOYEE, ASSISTANT_MANAGER | Employee home — my tasks, schedule, target |
| **/schedule/view** | All | View weekly schedule (read-only) |
| **/schedule/edit** | MANAGER, ASSISTANT_MANAGER, ADMIN, SUPER_ADMIN* | Edit weekly schedule (grid, Excel, month) |
| **/schedule/editor** | MANAGER, ASSISTANT_MANAGER, ADMIN, SUPER_ADMIN* | Day-by-day schedule editor |
| **/schedule/audit** | MANAGER, ADMIN, SUPER_ADMIN | Schedule audit log |
| **/schedule/audit-edits** | MANAGER, ADMIN, SUPER_ADMIN | Edit history and revert |
| **/approvals** | MANAGER, ADMIN, SUPER_ADMIN† | Approve/reject schedule weeks |
| **/tasks** | All | My tasks |
| **/tasks/monitor** | MANAGER, ADMIN, SUPER_ADMIN | Monitor team task completion |
| **/tasks/setup** | MANAGER, ADMIN, SUPER_ADMIN | Configure recurring tasks |
| **/inventory/daily** | All | Daily inventory assignments |
| **/inventory/daily/history** | MANAGER, ADMIN, SUPER_ADMIN | Inventory completion history |
| **/inventory/zones** | All | Zone assignments and weekly view |
| **/inventory/follow-up** | MANAGER, ADMIN, SUPER_ADMIN | Follow-up absent/incomplete |
| **/boutique/tasks** | MANAGER, ADMIN, SUPER_ADMIN | Boutique-level tasks |

\* Schedule edit: also requires **canEditSchedule**.  
† Approvals: also requires **canApproveWeek** where applicable.

---

## Executive (الإدارة التنفيذية)

| Path | Roles | Description |
|------|-------|--------------|
| **/executive** | MANAGER, ADMIN, SUPER_ADMIN | Executive dashboard (single-page) |
| **/executive/insights** | MANAGER, ADMIN, SUPER_ADMIN | Insights and analytics |
| **/executive/compare** | MANAGER, ADMIN, SUPER_ADMIN | Compare boutiques/periods |
| **/executive/employees** | MANAGER, ADMIN, SUPER_ADMIN | Employee intelligence list |
| **/executive/employees/[empId]** | MANAGER, ADMIN, SUPER_ADMIN | Employee detail (from list) |
| **/executive/monthly** | MANAGER, ADMIN, SUPER_ADMIN | Monthly executive summary |
| **/executive/network** | MANAGER, ADMIN, SUPER_ADMIN | Network view (when enabled) |

---

## Sales (المبيعات)

| Path | Roles | Description |
|------|-------|--------------|
| **/sales/my** | EMPLOYEE | My sales |
| **/sales/summary** | ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN | Sales summary |
| **/sales/returns** | All | Returns |
| **/sales/import** | MANAGER, ADMIN, SUPER_ADMIN | Import sales (Excel/CSV) |
| **/sales/import-issues** | ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN | Import issues |
| **/sales/daily** | MANAGER, ADMIN, SUPER_ADMIN | Daily sales ledger |
| **/sales/monthly-matrix** | ASSISTANT_MANAGER, MANAGER, ADMIN, SUPER_ADMIN | Monthly matrix |
| **/admin/targets** | MANAGER, ADMIN, SUPER_ADMIN | Sales targets |
| **/admin/sales-edit-requests** | MANAGER, ADMIN, SUPER_ADMIN | Sales edit requests |
| **/me/target** | All | My personal sales target |

---

## Leaves (الإجازات)

| Path | Roles | Description |
|------|-------|--------------|
| **/leaves/requests** | EMPLOYEE, ASSISTANT_MANAGER | My leave requests |
| **/leaves** | MANAGER, ADMIN, SUPER_ADMIN | Manage leave requests |
| **/boutique/leaves** | MANAGER, ADMIN, SUPER_ADMIN | Boutique leave overview |

---

## Planner & Sync

| Path | Roles | Description |
|------|-------|--------------|
| **/planner-export** | MANAGER, ADMIN, SUPER_ADMIN | Export schedule for planner |
| **/sync/planner** | MANAGER, ADMIN, SUPER_ADMIN | Sync with external planner |

---

## Administration (الإدارة)

| Path | Roles | Description |
|------|-------|--------------|
| **/admin/boutiques** | ADMIN, SUPER_ADMIN | Boutiques |
| **/admin/boutiques/[id]** | ADMIN, SUPER_ADMIN | Boutique detail |
| **/admin/regions** | ADMIN, SUPER_ADMIN | Regions |
| **/admin/boutique-groups** | ADMIN, SUPER_ADMIN | Boutique groups |
| **/admin/memberships** | ADMIN, SUPER_ADMIN | User–boutique memberships |
| **/admin/control-panel/delegation** | MANAGER, ADMIN, SUPER_ADMIN | Delegation control |
| **/admin/system** | ADMIN, SUPER_ADMIN | System settings |
| **/admin/system/version** | ADMIN, SUPER_ADMIN | Version & deploys |
| **/admin/system-audit** | ADMIN, SUPER_ADMIN | System audit |
| **/admin/audit/login** | ADMIN, SUPER_ADMIN | Login audit |
| **/admin/employees** | MANAGER, ADMIN, SUPER_ADMIN | Employees |
| **/admin/users** | ADMIN, SUPER_ADMIN | Users and roles |
| **/admin/coverage-rules** | ADMIN, SUPER_ADMIN | Coverage rules (AM/PM min) |
| **/admin/kpi-templates** | ADMIN, SUPER_ADMIN | KPI templates |
| **/admin/import** | ADMIN, SUPER_ADMIN | Admin import tools |
| **/admin/import/month-snapshot** | ADMIN, SUPER_ADMIN | Month snapshot upload |
| **/admin/historical-import** | ADMIN, SUPER_ADMIN | Historical import |

---

## KPI

| Path | Roles | Description |
|------|-------|--------------|
| **/kpi/upload** | MANAGER, ADMIN, SUPER_ADMIN | Upload KPI data |

---

## Help

| Path | Roles | Description |
|------|-------|--------------|
| **/about** | All | About Team Monitor |

---

## Quick reference — by role

- **EMPLOYEE:** /employee, /schedule/view, /tasks, /inventory/daily, /inventory/zones, /sales/my, /sales/returns, /leaves/requests, /me/target, /about  
- **ASSISTANT_MANAGER:** + schedule edit (if canEditSchedule), /sales/summary, /sales/import-issues, /sales/monthly-matrix, /admin/employees  
- **MANAGER:** + home /, approvals (if canApproveWeek), executive, sales, leaves, planner, /admin/control-panel/delegation, /admin/employees, /kpi/upload  
- **ADMIN / SUPER_ADMIN:** + all admin pages, users, system, audit, import, month-snapshot, historical-import  

Source: `lib/navConfig.ts` and middleware.
