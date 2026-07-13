# Architecture Stabilization Phase — Pre-Implementation Audit

**Project:** Team Monitor (repo: `Aziz-85/Team-Monitor`)  
**Version audited:** v2.3.128 (`package.json` / `VERSION`)  
**Audit date:** 2026-07-13  
**Scope:** Phase 0 — read-only inspection; no operational code changes  
**Auditor:** Architecture Stabilization Phase (automated + manual code trace)

---

## Executive Summary

Team Monitor is a mature **Next.js 14 App Router** application with **~100 Prisma models**, **119 dashboard pages**, **319 API routes**, and **73 Jest test files**. The system already implements several stabilization patterns (SalesEntry canonical writes, scope SSOT, sales parity tests, import batch audit). However, **sales data flows through four parallel write paths**, **boutique resolution is split across five helpers**, **scope/auth logic is duplicated across 10+ modules**, and **CI runs deploy without typecheck/lint/test gates**.

This audit establishes the baseline before Phase 1–10 implementation. All findings are traced to actual source files, not assumptions.

---

## 1. System Map

### 1.1 Authentication

| Component | Location | Purpose |
|-----------|----------|---------|
| Session cookie | `dt_session` → `Session` model | Web auth; rotated on login |
| Edge middleware | `middleware.ts` | Page auth, DEMO_VIEWER write block, executive feature flag |
| Session helpers | `lib/auth.ts` | `getSessionUser`, `requireSession`, `requireRole`, password verify |
| Rate limiting | `lib/authRateLimit.ts` → `AuthRateLimit` | IP/email brute-force protection |
| Auth audit | `lib/authAudit.ts` → `AuthAuditLog` | Login success/fail, lockout, security alerts |
| 2FA (TOTP) | `User.totpSecretEncrypted`, `/api/auth/2fa/*` | Optional two-factor |
| Account lockout | `User.lockedUntil`, `failedLoginAttempts` | Login abuse protection |
| Mobile JWT | `lib/jwt/mobileJwt.ts`, `/api/mobile/auth/*` | Separate token auth for Expo app |
| Platform owner mode | `Session.activeMode`, `lib/platformOwner/*` | Dual BRANCH_MANAGER / PLATFORM_ADMIN mode |
| CSRF | `/api/auth/csrf` | Token for sensitive forms |

**Data flow:** Browser → `middleware.ts` (pages) → `getSessionUser()` (API) → `User` + `Employee` + `Boutique` join.

---

### 1.2 Users

| Component | Models | Key files |
|-----------|--------|-----------|
| User CRUD | `User` | `app/api/admin/users/route.ts` |
| Password reset | `User.passwordHash`, `mustChangePassword` | `app/api/admin/users/reset-password/route.ts` |
| Role assignment | `User.role`, `Role` enum | `lib/rbac.ts`, `lib/routeMatrix.ts` |
| Session binding | `User.boutiqueId` (required) | Migration `20260229000001` |
| Preferences | `UserPreference` | `scopeJson`, `adminFilterJson`, `operationalBoutiqueId` |
| Delegation overlay | `DelegationGrant`, `DelegationAuditLog` | `lib/rbac/effectiveAccess.ts` |
| System-only accounts | `Employee.isSystemOnly` | Excluded from roster |

**Writers:** Admin routes, seed, login (session create).  
**Readers:** All authenticated routes via `getSessionUser()`.

---

### 1.3 Employees

| Component | Models | Key files |
|-----------|--------|-----------|
| Employee roster | `Employee` | `app/api/admin/employees/route.ts` |
| Current boutique | `Employee.boutiqueId` | `lib/tenancy/operationalRoster.ts` (SSOT for roster) |
| Historical assignment | `EmployeeAssignment` | `lib/sales/employeeAssignmentAtDate.ts` |
| Team history | `EmployeeTeamHistory`, `EmployeeTeamAssignment` | `app/api/admin/employees/[empId]/team-change/route.ts` |
| Transfer audit | `EmployeeTransferAudit` | `app/api/area/employees/transfer/route.ts` |
| Day overrides | `EmployeeDayOverride` | Schedule/sales availability |
| Comp days | `CompDayLedger` | Compensatory off tracking |

**Critical distinction:** `Employee.boutiqueId` = operational roster membership; `UserBoutiqueMembership` = login access scope.

---

### 1.4 Organizations & Regions

| Component | Models | Key files |
|-----------|--------|-----------|
| Organization | `Organization` | `app/api/admin/regions/route.ts` (indirect) |
| Region | `Region` | Admin boutique management |
| Boutique groups | `BoutiqueGroup`, `BoutiqueGroupMember` | `app/api/admin/boutique-groups/route.ts` |
| System config | `SystemConfig` | Default boutique ID, global settings |

---

### 1.5 Boutiques

| Component | Models | Key files |
|-----------|--------|-----------|
| Boutique entity | `Boutique` | `app/api/admin/boutiques/route.ts` |
| Configuration | `BoutiqueConfiguration`, `BoutiqueShiftTemplate`, `BoutiqueSpecialOperatingPeriod`, `BoutiqueCoveragePolicy` | `app/api/admin/boutique-configuration/route.ts` |
| Keys | `BoutiqueKey`, `KeyHandover` | `app/api/keys/*` |
| Scope settings | `ScopeSetting` | `maxSalesGapDays` per boutique |
| Soft disable | `Boutique.isActive` | Excluded from scope selector |

---

### 1.6 Boutique Memberships

| Component | Models | Key files |
|-----------|--------|-----------|
| Membership | `UserBoutiqueMembership` | `app/api/admin/memberships/route.ts` |
| Permission flags | `canAccess`, `canManageTasks`, `canManageLeaves`, `canManageSales`, `canManageInventory` | `lib/membershipPermissions.ts` |
| Scope resolution | Memberships drive allowed boutique IDs | `lib/scope/resolveScope.ts`, `lib/scope/ssot.ts` |

---

### 1.7 Employee Assignments

| Component | Models | Key files |
|-----------|--------|-----------|
| Historical rows | `EmployeeAssignment` (fromDate/toDate) | `lib/sales/employeeAssignmentAtDate.ts` |
| Transfer | Creates assignment + updates `Employee.boutiqueId` | `app/api/area/employees/transfer/route.ts` |
| Import validation | Warnings only — does not reroute sales | `yearlyEmployeeSalesImport.ts`, `import-ledger/route.ts` |

**Gap:** No unified `resolveEmployeeBoutiqueAtDate()` service; only `resolveEmployeeAssignmentAtDate()` for import warnings.

---

### 1.8 Sales (multi-layer)

See Section 3 for full model map. Summary:

| Layer | Models | Role |
|-------|--------|------|
| **Canonical KPI read/write** | `SalesEntry` | Dashboard, performance, targets vs actual |
| **Daily operational ledger** | `BoutiqueSalesSummary`, `BoutiqueSalesLine`, `SalesImportBatch` | Manager daily entry, matrix import |
| **Transaction ledger** | `SalesLedgerBatch`, `SalesTransaction`, `ImportIssue` | Row-level Excel, returns/exchanges |
| **Admin direct import** | `SalesEntryImportBatch`, `SalesEntryImportBatchLine` | MSR Excel, historical import |

**Central write service:** `lib/sales/upsertSalesEntry.ts` → `upsertCanonicalSalesEntry()`  
**Central read service:** `lib/sales/readSalesAggregate.ts`  
**Ledger → canonical sync:** `lib/sales/syncLedgerToSalesEntry.ts`, `syncDailyLedgerToSalesEntry.ts`

---

### 1.9 Sales Imports

| Pipeline | Entry | Output models |
|----------|-------|---------------|
| Daily matrix Excel | `/api/sales/import/apply` | Ledger → sync → `SalesEntry` |
| Yearly employee calendar | `/api/sales/import/yearly/*` | Ledger + `SalesEntryImportBatch` → sync |
| Historical initial/correction | `/api/admin/import-center/historical-sales/*` | Direct `SalesEntry` |
| MSR admin V2 | `/api/admin/sales-import` | Direct `SalesEntry` + batch audit |
| Transaction ledger | `/api/sales/import-ledger` | `SalesTransaction` (no auto-sync to SalesEntry) |
| Secure matrix edit | `/api/admin/sales/monthly-matrix-secure-edit/save` | Direct `SalesEntry` (re-auth gated) |

**File hash dedup:** Present on `SalesEntryImportBatch.fileSha256`, `SalesLedgerBatch.fileHash`, `KpiUpload.fileHash`. **Not unified** across all import types.

---

### 1.10 Targets

| Component | Models | Key files |
|-----------|--------|-----------|
| Boutique monthly | `BoutiqueMonthlyTarget` | `app/api/targets/boutiques/route.ts` |
| Employee monthly | `EmployeeMonthlyTarget` | `app/api/targets/employees/route.ts` |
| Role weights | `SalesTargetRoleWeight` | `lib/sales-target-weights.ts` |
| Generation | Auto-distribute from boutique target | `/api/admin/generate-employee-targets` |
| Import | Boutique + employee Excel | `lib/targets/importBoutiques.ts`, `importEmployees.ts` |
| Change audit | `TargetChangeAudit`, `SalesTargetAudit` | Target modification trail |
| Daily allocation | Pure calculation | `lib/targets/dailyTarget.ts` |

---

### 1.11 Performance

| Component | Key files | Data sources |
|-----------|-----------|--------------|
| Metrics aggregator (SSOT) | `lib/metrics/aggregator.ts` | `SalesEntry`, targets, leaves |
| Performance engine | `lib/performance/performanceEngine.ts` | Pure math (target/sales/percent) |
| Performance Hub | `lib/performance/hubEngine.ts` | Orchestrates SalesEntry + reporting targets |
| Analytics layer | `lib/analytics/performanceLayer.ts` | Pace, forecast inputs |
| Executive scoring | `lib/executive/score.ts`, `salesLineRevenue.ts` | **Mixed:** ledger + SalesEntry |

**Parity registry:** `lib/sales/salesGovernance.ts` — documents approved read surfaces; `/api/executive/monthly` explicitly excluded (mixed sources).

---

### 1.12 Scheduling

| Component | Models | Key files |
|-----------|--------|-----------|
| Roster | `ShiftOverride`, `ShiftOverrideSegment` | `lib/services/roster.ts` |
| Week status | `ScheduleWeekStatus` | Approve/publish workflow |
| Locks | `ScheduleLock` | Day/week locking |
| Edit audit | `ScheduleEditAudit` | Change trail |
| Coverage | `CoverageRule`, `BoutiqueCoveragePolicy` | Min AM/PM staffing |
| Calendar policy | `OfficialHoliday`, `WeeklyOffSuspensionPeriod`, `EventPeriod` | Non-working days |
| Planner AI | `lib/services/schedulePlanner.ts`, `scheduleAssistantChat.ts` | Week plan generation |
| Solver v3 | `/api/schedule/v3/*` | Constraint-based solver |

---

### 1.13 Leaves

| Component | Models | Key files |
|-----------|--------|-----------|
| Legacy leave records | `Leave` | Direct approved leaves |
| Workflow requests | `LeaveRequest` | DRAFT → SUBMITTED → APPROVED/REJECTED |
| Manager approval | Status transitions | `/api/leaves/approve`, `reject`, `escalate` |
| Admin escalation | `escalatedAt`, `escalatedById` | `/api/leaves/admin-approve` |
| Audit | `lib/leaveAudit.ts` | Leave action logging |

---

### 1.14 Tasks

| Component | Models | Key files |
|-----------|--------|-----------|
| Task definitions | `Task`, `TaskPlan`, `TaskSchedule` | `/api/tasks/setup/*` |
| Completions | `TaskCompletion` | `/api/tasks/completion` |
| Planner sync | `PlannerTaskLink`, `PlannerTaskCompletion` | `lib/integrations/planner/*` |
| Import batches | `PlannerImportBatch`, `PlannerImportRow` | Manual Planner Excel import |

---

### 1.15 Inventory

| Component | Models | Key files |
|-----------|--------|-----------|
| Daily rotation | `InventoryRotationConfig`, `InventoryRotationMember`, `InventoryDailyRun` | `/api/inventory/daily/*` |
| Zone weekly | `InventoryZone`, `InventoryZoneAssignment`, `InventoryWeeklyZoneRun` | `/api/inventory/zones/*` |
| Exclusions/absences | `InventoryDailyExclusion`, `InventoryAbsent` | Manager overrides |
| Waiting queue | `InventoryDailyWaitingQueue` | Skipped employee queue |

---

### 1.16 Notifications

| Component | Models | Key files |
|-----------|--------|-----------|
| In-app | `Notification` | Created by various services |
| Push (mobile) | `MobileDevicePushToken`, `NotificationPreference` | `/api/mobile/push/*` |
| Event dedup | `NotificationEventLog` | `lib/notify/emitEvent.ts` |
| Task reminders | Cron | `/api/cron/task-reminders` |

---

### 1.17 Audit Logs

| Log type | Model | Scope |
|----------|-------|-------|
| General audit | `AuditLog` | Schedule, inventory, team, locks, approvals |
| Auth audit | `AuthAuditLog` | Login events |
| Sales ledger audit | `SalesLedgerAudit` | Daily ledger actions |
| Sales matrix audit | `SalesMatrixEditCellAudit`, `SalesMatrixEditActivityLog` | Secure matrix edits |
| Target audit | `TargetChangeAudit`, `SalesTargetAudit` | Target changes |
| Transfer audit | `EmployeeTransferAudit` | Employee boutique transfers |
| Delegation audit | `DelegationAuditLog` | Permission grants |
| KPI audit | `KpiAuditLog` | KPI uploads |
| Schedule edit audit | `ScheduleEditAudit` | Schedule changes |

**Gap:** No unified audit query layer; each module writes independently.

---

### 1.18 Mobile APIs

| Route group | Auth | Purpose |
|-------------|------|---------|
| `/api/mobile/auth/*` | Public/JWT | Login, refresh, logout |
| `/api/mobile/me` | JWT | Profile |
| `/api/mobile/dashboard/*` | JWT | Manager dashboard, targets |
| `/api/mobile/team/today` | JWT | Today's roster |
| `/api/mobile/push/*` | JWT | Push token registration |

**Native app:** `mobile-native/` (Expo/React Native) consumes these endpoints.

---

### 1.19 Planner Integrations

| Component | Models | Key files |
|-----------|--------|-----------|
| Integration config | `PlannerIntegration` | `/api/integrations/planner/route.ts` |
| Task linking | `PlannerTaskLink` | Two-way sync status |
| User mapping | `PlannerUserMap` | Microsoft user → Employee |
| Bucket mapping | `PlannerBucketMap` | Planner bucket → task type |
| Sync logs | `PlannerSyncLog` | Inbound/outbound events |
| Webhook | `/api/integrations/planner/webhook` | `x-planner-webhook-secret` (no session) |
| Graph direct | `lib/integrations/planner/graphClient.ts` | Microsoft Graph API |
| Manual export | `lib/sync/plannerExportV2.ts` | Schedule → Planner format |

---

## 2. Pages & Routes Map

### 2.1 Architecture Overview

```
Browser/Mobile
    ↓
middleware.ts (pages) / route handler auth (API)
    ↓
lib/auth.ts → Session → User
    ↓
lib/scope/ssot.ts → boutique scope
    ↓
lib/rbac.ts / membershipPermissions / ledgerRbac
    ↓
Domain service (lib/sales/*, lib/services/*, lib/targets/*, …)
    ↓
Prisma → PostgreSQL
```

**No Server Actions.** All mutations via API routes (`app/api/**/route.ts`) called from client components via `authFetch`.

### 2.2 Route Protection Layers

| Layer | File | Enforces |
|-------|------|----------|
| Edge middleware | `middleware.ts` | Session cookie, DEMO_VIEWER write block, executive feature flag |
| Dashboard layout | `app/(dashboard)/layout.tsx` | Session + boutique required |
| RouteGuard (client) | `components/RouteGuard.tsx` | Role → allowed paths (`lib/routeMatrix.ts`) |
| API auth | Per-route `requireSession` / `requireRole` / `requireAdmin` | Server-side authorization |
| Scope SSOT | `lib/scope/ssot.ts` | Boutique isolation |
| Domain RBAC | `ledgerRbac.ts`, `targets/scope.ts`, `schedulePermissions.ts` | Feature-specific permissions |

### 2.3 Critical Pages — Detailed Map

The table below covers **high-risk and high-traffic surfaces**. Full inventory: 119 dashboard pages, 319 API routes (see `docs/audit/routes_pages.json` for partial list; subagent scan 2026-07-13 for complete API inventory).

| Page | Route | Allowed Roles | Boutique Scope | Primary APIs | Models (R/W) | Data Source | Reads | Writes |
|------|-------|---------------|----------------|--------------|--------------|-------------|-------|--------|
| Manager Home | `/` | MANAGER, ADMIN, SUPER_ADMIN, AREA_MANAGER | Session / operational | `/api/home`, `/api/dashboard` | SalesEntry, targets, schedule | SalesEntry (KPI) | ✓ | — |
| Employee Home | `/employee` | EMPLOYEE, ASSISTANT_MANAGER | Employee.boutiqueId | `/api/employee/home` | Task, schedule, targets | Mixed | ✓ | — |
| Login | `/login` | Public | — | `/api/auth/login` | Session, User, AuthAuditLog | — | — | ✓ |
| Daily Sales Ledger | `/sales/daily` | MANAGER+ | Operational (trusted) | `/api/sales/daily/*` | BoutiqueSalesSummary, BoutiqueSalesLine → sync SalesEntry | Ledger + SalesEntry | ✓ | ✓ |
| Sales Import | `/sales/import` | MANAGER+ | Trusted operational | `/api/sales/import/preview`, `/apply` | Ledger → SalesEntry | Excel → ledger | ✓ | ✓ |
| Yearly Import | via import UI | MANAGER+ | Trusted operational | `/api/sales/import/yearly/*` | Ledger, SalesEntryImportBatch | Excel | ✓ | ✓ |
| Monthly Matrix View | `/sales/monthly-matrix` | ADMIN, SUPER_ADMIN | Operational / admin filter | `/api/sales/monthly-matrix` | SalesEntry | SalesEntry | ✓ | — |
| Secure Matrix Edit | `/admin/sales/monthly-matrix-secure-edit` | ADMIN, SUPER_ADMIN | Re-auth + unlock session | `/api/admin/sales/monthly-matrix-secure-edit/*` | SalesEntry, audit models | SalesEntry | ✓ | ✓ |
| MSR Admin Import | `/admin/import/sales` | MANAGER+ | Server-resolved | `/api/admin/sales-import` | SalesEntry, SalesEntryImportBatch | Excel direct | ✓ | ✓ |
| Historical Import | `/admin/import/historical` | ADMIN, SUPER_ADMIN | Server-resolved | `/api/admin/import-center/historical-sales/*` | SalesEntry | Excel direct | ✓ | ✓ |
| Transaction Import | via sales import | MANAGER+ / ADMIN | Scope-checked | `/api/sales/import-ledger` | SalesTransaction, SalesLedgerBatch | Excel txn | ✓ | ✓ |
| My Sales | `/sales/my` | EMPLOYEE | Own userId | `/api/me/sales` | SalesEntry | SalesEntry | ✓ | — |
| Sales Summary | `/sales/summary` | MANAGER+ | Operational | `/api/sales/summary` | SalesEntry | SalesEntry | ✓ | — |
| Performance Hub | `/performance` | MANAGER+ | Operational / multi (area) | `/api/performance/hub` | SalesEntry, targets | SalesEntry + targets | ✓ | — |
| Targets Overview | `/targets` | MANAGER+ | Scope | `/api/targets/*` | BoutiqueMonthlyTarget, EmployeeMonthlyTarget | Target tables | ✓ | — |
| Target Import | `/targets/import` | AREA_MANAGER, SUPER_ADMIN | Allowed boutiques | `/api/targets/import/*/preview\|apply` | Target models | Excel | ✓ | ✓ |
| Executive Monthly | `/executive/monthly` | MANAGER+ (feature flag) | Operational | `/api/executive/monthly` | **Mixed:** ledger + SalesEntry | Mixed | ✓ | — |
| Schedule Edit | `/schedule/edit` | MANAGER+ (canEditSchedule) | Schedule scope | `/api/schedule/week/grid/save` | ShiftOverride, ScheduleEditAudit | Roster DB | ✓ | ✓ |
| Leaves (manager) | `/leaves` | MANAGER+ | Operational | `/api/leaves/*` | LeaveRequest | LeaveRequest | ✓ | ✓ |
| Leave Requests (employee) | `/leaves/requests` | EMPLOYEE, ASST_MGR | Own user | `/api/leaves/request`, `/submit` | LeaveRequest | LeaveRequest | ✓ | ✓ |
| Tasks | `/tasks` | Most roles | Operational | `/api/tasks/day`, `/completion` | Task, TaskCompletion | Task DB | ✓ | ✓ |
| Inventory Daily | `/inventory/daily` | Most roles | Operational | `/api/inventory/daily/*` | InventoryDailyRun | Inventory DB | ✓ | ✓ |
| Admin Users | `/admin/users` | ADMIN, SUPER_ADMIN | Global | `/api/admin/users` | User | User DB | ✓ | ✓ |
| Admin Employees | `/admin/employees` | ADMIN, SUPER_ADMIN | Global / filter | `/api/admin/employees` | Employee | Employee DB | ✓ | ✓ |
| Area Transfer | `/area/employees` | AREA_MANAGER, SUPER_ADMIN | Multi-boutique | `/api/area/employees/transfer` | Employee, EmployeeAssignment, EmployeeTransferAudit | Employee DB | ✓ | ✓ |
| Import Center | `/admin/import` | ADMIN, SUPER_ADMIN | Admin scope | Multiple import APIs | Various | Excel | ✓ | ✓ |
| Compliance | `/compliance` | MANAGER+ | Operational | `/api/compliance/*` | ComplianceItem | Compliance DB | ✓ | ✓ |
| Planner Sync | `/sync/planner` | MANAGER+ | Operational | `/api/sync/planner/*` | Planner models | Planner/schedule | ✓ | ✓ |
| Mobile Dashboard | (native app) | JWT auth | User.boutiqueId | `/api/mobile/dashboard/*` | SalesEntry, targets | SalesEntry | ✓ | — |

### 2.4 API Route Counts by Domain

| Domain | Count | Primary scope module |
|--------|-------|---------------------|
| Admin | 73 | `requireAdmin()`, `ssot.ts` |
| Schedule | 34 | `scheduleScope.ts` |
| Sales | 33 | `ledgerRbac.ts`, `operationalScope.ts` |
| Inventory | 16 | `requireOperationalBoutique.ts` |
| Executive | 14 | `execAccess.ts`, `ssot.ts` |
| Targets | 15 | `targets/scope.ts` |
| Leaves | 11 | `requireOperationalBoutique.ts` |
| Tasks | 11 | `ssot.ts` |
| Mobile | 10 | JWT middleware |
| Integrations/Planner | 13 | Webhook secret / admin |
| Other | ~93 | Various |

---

## 3. Database Map — Sales, Employees, Branches

### 3.1 Branch / Organization Models

| Model | Purpose | Writers | Readers | Relations | Source Type | Duplication Risk |
|-------|---------|---------|---------|-----------|-------------|------------------|
| `Organization` | Top-level org | Admin seed | Admin UI | → Region | Primary | None |
| `Region` | Geographic grouping | Admin | Admin, scope | → Boutique | Primary | None |
| `Boutique` | Branch/store unit | Admin | All modules | Central hub model | **Primary SSOT for branch identity** | None |
| `BoutiqueGroup` | Logical grouping | Admin | Scope (analytical) | ↔ Boutique via members | Primary | Overlaps with Region conceptually |
| `BoutiqueGroupMember` | Group membership | Admin | Scope resolver | Boutique ↔ Group | Junction | — |
| `UserBoutiqueMembership` | User login access + flags | Admin | Auth, scope, RBAC | User ↔ Boutique | **Primary for access control** | Overlaps with `User.boutiqueId` (session binding) |
| `ScopeSetting` | Per-boutique config | Admin | Sales gap validation | Boutique | Primary | — |
| `SystemConfig` | Global key-value | Admin | Scope fallback | — | Primary | — |

### 3.2 Employee Models

| Model | Purpose | Writers | Readers | Relations | Source Type | Duplication Risk |
|-------|---------|---------|---------|-----------|-------------|------------------|
| `Employee` | Employee master + current boutique | Admin, transfer API | Roster, sales, schedule, targets | → Boutique, ↔ User | **Primary SSOT for current assignment** | `boutiqueId` duplicated in User, Assignment |
| `EmployeeAssignment` | Historical boutique assignment | Transfer API, manual | Import validation (warnings) | Employee ↔ Boutique | **Primary for historical truth** | Fallback to `Employee.boutiqueId` when empty |
| `EmployeeTeamHistory` | Team change log (legacy) | Team change API | Schedule | Employee | Derived/historical | Overlaps with `EmployeeTeamAssignment` |
| `EmployeeTeamAssignment` | Effective-date team | Team change API | Schedule generation | Employee | Primary (newer) | Two team history models |
| `EmployeeTransferAudit` | Transfer action log | Transfer API | Admin/area views | Employee | Audit (derived) | — |
| `EmployeeDayOverride` | Force work/off on date | Admin/schedule | Schedule, availability | Employee, Boutique | Primary | — |
| `User` | Login account | Admin | Auth everywhere | → Boutique (session), ↔ Employee | Primary for auth | `User.boutiqueId` vs `Employee.boutiqueId` vs `UserPreference.operationalBoutiqueId` |
| `UserPreference` | UI scope preferences | User (via API) | Scope resolver (opt-in) | User | **UI preference only** | Must not drive financial ownership |

### 3.3 Sales Models

| Model | Purpose | Writers | Readers | Relations | Source Type | Duplication Risk |
|-------|---------|---------|---------|-----------|-------------|------------------|
| `SalesEntry` | **Canonical daily sales per user per boutique per day** | `upsertCanonicalSalesEntry`, sync, imports | Dashboard, performance, metrics, executive (partial) | User (seller), Boutique | **Primary SSOT for KPIs** | Synced from ledger; also written directly by admin imports |
| `BoutiqueSalesSummary` | Daily boutique total + lock status | Daily ledger API, imports | Daily sales UI, lock checks | → BoutiqueSalesLine | **Operational write model** | `totalSar` duplicates sum of lines AND syncs to SalesEntry |
| `BoutiqueSalesLine` | Per-employee daily amount in ledger | Daily lines API, matrix/yearly import | Reconciliation, sync | → Summary | Operational detail | Amount duplicated in SalesEntry after sync |
| `SalesImportBatch` | Daily import audit (ledger) | Matrix import apply | Import history | → Summary | Audit | Separate from SalesEntryImportBatch |
| `SalesEntryImportBatch` | Admin SalesEntry import audit | MSR/historical/yearly imports | Rollback, dedup | → SalesEntry | Audit | Separate from SalesImportBatch |
| `SalesEntryImportBatchLine` | Per-row import outcome | Import apply | Rollback diagnostics | → Batch | Audit detail | — |
| `SalesLedgerBatch` | Transaction file import batch | import-ledger | Transaction queries | → SalesTransaction | Audit | fileHash dedup exists |
| `SalesTransaction` | Row-level sale/return/exchange | import-ledger, returns API | Returns UI, executive (partial) | Employee, Boutique | **Separate transaction layer** | **NOT auto-synced to SalesEntry** — major duplication gap |
| `ImportIssue` | Import validation issues | import-ledger | Import issues UI | → SalesLedgerBatch | Derived | — |
| `SalesLedgerAudit` | Ledger action log | Ledger operations | Admin audit | — | Audit | — |
| `SalesEditGrant` | Temporary edit permission | Admin approval | Sales entry override | User, date | Policy | — |
| `SalesMatrixEditUnlockSession` | Secure matrix edit session | Re-auth unlock | Matrix secure edit | User, Boutique | Session | — |
| `SalesMatrixEditCellAudit` | Per-cell matrix change | Secure save | Rollback | — | Audit | — |
| `SalesMatrixSnapshot` | Pre-save matrix backup | Secure save | Forensics | — | Backup | — |

### 3.4 Target Models

| Model | Purpose | Writers | Readers | Source Type | Duplication Risk |
|-------|---------|---------|---------|-------------|------------------|
| `BoutiqueMonthlyTarget` | Boutique monthly target SAR | Admin, import, generate | Performance, dashboard | **Primary** | None |
| `EmployeeMonthlyTarget` | Employee monthly target SAR | Admin, import, generate | Performance, my-target | **Primary** | Generated snapshots may stale vs current roster |
| `SalesTargetRoleWeight` | Role distribution weights | Admin seed | Target generation | Primary | — |
| `TargetChangeAudit` | Target modification log | Target CRUD | Admin audit | Audit | — |
| `SalesTargetAudit` | Target generation log | Generate/regenerate | Admin | Audit | — |

### 3.5 Sales Data Flow Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           WRITE PATHS (4)               │
                    └─────────────────────────────────────────┘
                                      │
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              │
  Daily Ledger    Matrix/Yearly   Admin MSR/      Transaction      │
  (manual/API)    Excel Import    Historical      import-ledger    │
        │              │              │              │              │
        ▼              ▼              ▼              ▼              │
  BoutiqueSales   BoutiqueSales   SalesEntry      SalesTransaction │
  Summary+Line    Line+Summary    (direct)        (standalone)     │
        │              │              │              │              │
        └──── sync ────┴──── sync ────┘              │              │
                    ▼                                │              │
              SalesEntry ◄── KPI SSOT ──────────────┘ (NOT synced) │
                    │                                               │
                    ▼                                               │
        ┌───────────────────────────────────┐                       │
        │  READ: readSalesAggregate.ts      │                       │
        │  READ: metrics/aggregator.ts      │                       │
        │  READ: performance/hubEngine.ts   │                       │
        └───────────────────────────────────┘                       │
                    │                                               │
                    ▼                                               │
        Dashboard / Performance / Targets / Mobile                  │
        (Executive monthly uses MIXED sources) ◄────────────────────┘
```

---

## 4. Current Risks

### 4.1 Critical

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| C1 | **SalesTransaction not synced to SalesEntry** | `import-ledger/route.ts` writes `SalesTransaction`; no call to `upsertCanonicalSalesEntry` | Returns/exchanges/txn imports invisible to KPI dashboard; executive/monthly uses ledger separately |
| C2 | **Four independent write paths to financial data** | Daily ledger, matrix import, admin direct import, transaction ledger | Same day/user/boutique can have conflicting amounts; precedence rules only cover SalesEntry writes |
| C3 | **No CI quality gate before deploy** | `.github/workflows/deploy.yml` runs bump + SSH deploy only; no typecheck/lint/test | Broken code can reach production; deploy workflow does not fail on test failures |
| C4 | **ADMIN can write sales to any boutique without membership check** | `lib/sales/ledgerRbac.ts` — ADMIN/SUPER_ADMIN bypass membership for `requestBoutiqueId` | Cross-boutique write by compromised admin session; IDOR if role misassigned |
| C5 | **Import auto-unlock bypasses lock workflow** | Matrix/yearly import force-unlocks `LOCKED` BoutiqueSalesSummary | Audit logged but financial control bypassed silently during import |

### 4.2 High

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| H1 | **No unified employee boutique resolution service** | `employeeAssignmentAtDate.ts` (import warnings only), `operationalRoster.ts` (current), `resolveOperationalBoutique.ts` (UI preference) | Performance/targets/schedule may use different boutique for same employee+date |
| H2 | **Executive monthly uses mixed data sources** | `salesGovernance.ts` notes `/api/executive/monthly` uses ledger + SalesEntry | Same period shows different numbers on executive vs performance hub |
| H3 | **Scope helpers duplicated (5+ modules)** | `ssot.ts`, `operationalScope.ts`, `resolveScope.ts`, `resolveOperationalBoutique.ts`, `scopeContext.ts` | Inconsistent boutique scope between routes; some still use `resolveScopeForUser(null)` per `SCOPE_AUDIT.md` |
| H4 | **No Zod validation library** | Grep shows Zod only in mobile-native lockfiles, not main app | Ad-hoc parsing in route handlers; inconsistent error messages; injection/type coercion risk |
| H5 | **File hash dedup not unified** | `SalesEntryImportBatch.fileSha256`, `SalesLedgerBatch.fileHash`, `KpiUpload.fileHash` — separate implementations | Same file can be re-imported via different pipelines |
| H6 | **MSR import boutique fallback to hardcoded default** | `adminMsrTemplateSalesImport.ts` falls back to `bout_dhhrn_001` | Sales mis-attributed to wrong boutique if employee mapping fails |
| H7 | **UserPreference.operationalBoutiqueId vs session boutique split** | UI uses preference; write auth uses `getTrustedOperationalBoutiqueId` (session) | User sees data for boutique A while writes go to boutique B |

### 4.3 Medium

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| M1 | **Historical assignment warnings only — no reroute** | `employeeAssignmentAtDate.ts` comment: "not routing" | Sales stay on upload boutique even when employee was at different branch |
| M2 | **Two team history models** | `EmployeeTeamHistory` + `EmployeeTeamAssignment` | Confusion about which is authoritative for schedule |
| M3 | **No `test:coverage` script** | `package.json` has `test` and `test:smoke` only | Cannot measure regression coverage; 80% target unmeasurable |
| M4 | **No staging environment separation documented** | Single `DATABASE_URL`; deploy workflow targets production | Staging/test may accidentally use production DB |
| M5 | **73 test files but no integration test DB setup** | Jest unit tests only; no PostgreSQL service in CI | Import/scope/permission flows untested end-to-end |
| M6 | **DEMO_VIEWER write block only at middleware** | `middleware.ts` blocks mutations; not all API routes double-check | Defense-in-depth gap if middleware bypassed |
| M7 | **Import pipelines share patterns but no unified lib/imports/** | Each import type has own parse/apply in `lib/sales/*`, `lib/targets/*` | Inconsistent validation, duplicate file size/MIME checks |
| M8 | **Achievement % calculated in multiple places** | `performanceEngine.ts`, `hubEngine.ts`, `metrics/aggregator.ts`, page components | Rounding/precision differences between pages |

### 4.4 Low

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| L1 | **Legacy route aliases and redirects** | `/schedule/editor` → `/schedule/edit`, `/planner-export` → `/sync/planner` | Navigation confusion; stale bookmarks |
| L2 | **65 existing audit docs with overlapping content** | `docs/SCOPE_AUDIT.md`, `docs/AUDIT_REPORT.md`, etc. | Documentation drift; this audit supersedes for stabilization phase |
| L3 | **`docs/audit/routes_pages.json` outdated** | Generated 2025-02-14, lists 52 pages vs 119 current | Stale reference for tooling |
| L4 | **No environment validation on startup** | No Zod/env schema for `DATABASE_URL`, secrets | Misconfiguration discovered at runtime |
| L5 | **`db:push` script exists in package.json** | `"db:push": "prisma db push"` | Developer may accidentally use push instead of migrate |
| L6 | **Mobile and web auth are separate systems** | Cookie session vs JWT | Permission changes may not propagate consistently |

---

## 5. Existing Stabilization Assets (Do Not Rebuild)

These patterns are already implemented and should be **extended**, not replaced:

| Asset | Location | Status |
|-------|----------|--------|
| SalesEntry canonical write | `lib/sales/upsertSalesEntry.ts` | ✅ Production-ready; extend coverage |
| SalesEntry write precedence | `lib/sales/salesEntryWritePrecedence.ts` | ✅ Working |
| Ledger → SalesEntry sync | `lib/sales/syncLedgerToSalesEntry.ts` | ✅ Working; extend to SalesTransaction |
| Sales read aggregate SSOT | `lib/sales/readSalesAggregate.ts` | ✅ Working |
| Metrics aggregator SSOT | `lib/metrics/aggregator.ts` | ✅ Working |
| Scope SSOT | `lib/scope/ssot.ts` | ✅ Implemented; not yet adopted by all routes |
| Sales governance registry | `lib/sales/salesGovernance.ts` | ✅ Documentation + dev hints |
| Sales parity tests | `__tests__/sales-integrity-parity.test.ts` | ✅ Working |
| SalesEntry import batch + rollback | `SalesEntryImportBatch`, rollback routes | ✅ Working |
| SSOT scope tests | `__tests__/ssot-scope.test.ts` | ✅ Working |
| Employee roster SSOT | `lib/tenancy/operationalRoster.ts` | ✅ Working |
| Target import preview/apply | `lib/targets/applyImportPlan.ts` | ✅ Pattern to generalize |

---

## 6. Test Coverage Baseline

| Category | Files | Notable gaps |
|----------|-------|--------------|
| Sales | 12 tests | No cross-boutique rejection integration test |
| Scope/SSOT | 3 tests | No full route-level IDOR suite |
| Targets | 8 tests | Missing employee transfer + target behavior |
| Schedule | 15 tests | Good coverage |
| Performance | 4 tests | Missing hub vs dashboard parity |
| Auth/Security | 2 tests | `securityAuth.test.ts`, `api-403.test.ts` — minimal |
| Import | 6 tests | No duplicate file hash test |
| **Total** | **73 test files** | No integration tests with DB; no coverage reporting |

**Smoke test scope (`npm run test:smoke`):** 3 files only (leaves, post-login, targets-me-vs-metrics).

---

## 7. CI/CD Baseline

| Workflow | File | Runs on | Steps |
|----------|------|---------|-------|
| Deploy | `.github/workflows/deploy.yml` | Push to main | Bump version → SSH deploy → prisma migrate deploy → build → pm2 reload → health check |
| CI (quality gate) | **Missing** | — | — |

**Gap:** No `ci.yml` with typecheck, lint, test, build, security audit. Deploy proceeds without quality gates.

---

## 8. Recommended Implementation Plan (Phases 1–10)

Based on actual codebase state. Each phase is independently reviewable.

### Phase 1 — Sales Source of Truth (Priority: Critical)

**Goal:** Document and enforce single write path; sync SalesTransaction → SalesEntry.

| Task | Files to touch | Risk |
|------|----------------|------|
| Create `SALES_SOURCE_OF_TRUTH.md` | `docs/architecture-stabilization/` | None |
| Create `lib/sales/index.ts` service facade | `recordBoutiqueSale`, `updateBoutiqueSale`, `importBoutiqueSales`, `syncSalesProjections`, `rebuildSalesProjections` | Medium — must not break existing imports |
| Wire SalesTransaction import to projection sync (or document exclusion) | `import-ledger/route.ts`, new `syncTransactionToSalesEntry.ts` | High — behavior change |
| Add regression tests for all 4 write paths → SalesEntry parity | `__tests__/sales-source-of-truth.test.ts` | None |
| Audit all routes that write financial data; route through facade | ~15 API routes | Medium |

**Do not start Phase 2 until:** typecheck + lint + test + build pass.

---

### Phase 2 — Employee Boutique Resolution

**Goal:** Single `resolveEmployeeBoutiqueAtDate()` used everywhere.

| Task | Files to touch |
|------|----------------|
| Create `lib/employees/resolveEmployeeBoutiqueAtDate.ts` | New service with priority: Assignment → Employee.boutiqueId → User.boutiqueId |
| Replace `resolveEmployeeAssignmentAtDate` callers | Import, performance, targets, schedule |
| Create `EMPLOYEE_BOUTIQUE_RESOLUTION.md` | Documentation |
| Add 8+ unit tests | Transfer, overlap, inactive, system-only, multi-boutique same day |

---

### Phase 3 — Scope & Permissions Unification

**Goal:** All routes use `lib/scope/ssot.ts`; no ADMIN bypass without audit.

| Task | Files to touch |
|------|----------------|
| Create `lib/auth/`, `lib/permissions/`, `lib/scope/` facades | Thin wrappers over existing |
| Migrate remaining `resolveScopeForUser(null)` callers | Per `SCOPE_AUDIT.md` P0/P1 list |
| Add IDOR integration tests | Cross-boutique read/write rejection |
| Document `PERMISSIONS.md` | Role matrix + DEMO_VIEWER rules |
| Harden ADMIN boutique override with explicit audit | `ledgerRbac.ts` |

---

### Phase 4 — Import Pipeline Unification

**Goal:** Shared pipeline with SHA-256 dedup across all import types.

| Task | Files to touch |
|------|----------------|
| Create `lib/imports/pipeline.ts` | Upload → Validate → Parse → Normalize → DryRun → Preview → Confirm → Transaction → Audit |
| Create `lib/imports/fileHash.ts` | Unified hash store/query |
| Migrate sales imports first | `matrixImportParse.ts`, `yearlyEmployeeSalesImport.ts`, `adminMsrTemplateSalesImport.ts` |
| Migrate target imports | `importBoutiques.ts`, `importEmployees.ts` |
| Create `IMPORT_PIPELINE.md` | Documentation |

---

### Phase 5 — Performance & Targets Unification

**Goal:** Same numbers on all pages for same period/scope.

| Task | Files to touch |
|------|----------------|
| Create `lib/targets/getEmployeeTarget.ts`, `getBoutiqueTarget.ts` | Central target resolution |
| Create `lib/sales/getEmployeePerformance.ts`, `getBoutiquePerformance.ts` | Central performance |
| Fix executive/monthly mixed sources | `/api/executive/monthly/route.ts` |
| Add parity tests: hub = dashboard = summary | `__tests__/performance-parity.test.ts` |
| Handle missing target as `Missing` not `0` | UI + API response shape |

---

### Phase 6 — Zod Validation

**Goal:** Replace ad-hoc parsing with shared schemas.

| Task | Files to touch |
|------|----------------|
| Add `zod` dependency | `package.json` |
| Create `lib/validation/` | env, API payloads, import rows, date ranges, IDs |
| Migrate highest-risk routes first | Sales import, target import, admin user CRUD |
| User-facing error messages | No stack traces |

---

### Phase 7 — Test Expansion

**Goal:** 70%+ overall coverage; 80% on sensitive services.

| Task | Files to touch |
|------|----------------|
| Add `test:coverage` script | `package.json`, `jest.config.js` |
| Expand smoke tests | Login, boutique isolation, import preview/apply, demo viewer |
| Add integration tests | PostgreSQL service container |
| Permission/scope regression suite | IDOR, cross-boutique, demo viewer POST |

---

### Phase 8 — CI/CD

**Goal:** Quality gate before any deploy.

| Task | Files to touch |
|------|----------------|
| Create `.github/workflows/ci.yml` | PR + push to main |
| Steps: npm ci → prisma generate → typecheck → lint → test → build → security:audit |
| Modify deploy.yml | `needs: ci` — deploy only after CI passes |
| PostgreSQL service container for integration tests | ci.yml |

---

### Phase 9 — Staging Environment

**Goal:** Safe pre-production environment.

| Task | Files to touch |
|------|----------------|
| Environment validation | `lib/validation/env.ts` |
| Staging visual indicator | Layout component |
| Create `STAGING.md` | Setup guide |
| Separate DATABASE_URL, secrets, upload storage, cookies | `.env.example`, docs |

---

### Phase 10 — Final Documentation

**Goal:** Complete documentation set + final report.

| Deliverable | Status |
|-------------|--------|
| `AUDIT.md` | ✅ This document |
| `ARCHITECTURE.md` | Pending |
| `DATABASE.md` | Pending |
| `SALES_SOURCE_OF_TRUTH.md` | Pending (Phase 1) |
| `EMPLOYEE_BOUTIQUE_RESOLUTION.md` | Pending (Phase 2) |
| `PERMISSIONS.md` | Pending (Phase 3) |
| `IMPORT_PIPELINE.md` | Pending (Phase 4) |
| `TESTING.md` | Pending (Phase 7) |
| `STAGING.md` | Pending (Phase 9) |
| `DEPLOYMENT.md` | Pending |
| `MIGRATION_PLAN.md` | Pending |
| `FINAL_REPORT.md` | Pending (after all phases) |

---

## 9. Phase 0 Exit Criteria

| Criterion | Status |
|-----------|--------|
| System map documented | ✅ Section 1 |
| Pages/routes map documented | ✅ Section 2 |
| Database map documented | ✅ Section 3 |
| Risks classified | ✅ Section 4 |
| Existing assets identified | ✅ Section 5 |
| Test/CI baseline captured | ✅ Sections 6–7 |
| Implementation plan based on actual code | ✅ Section 8 |
| No operational code modified | ✅ |

**Phase 0 is complete. Phase 1 may begin upon approval.**

---

## Appendix A — Key File Index

```
lib/
├── auth.ts                          # Session, requireSession, requireRole
├── rbac.ts                          # Role checks, schedule edit permission
├── rbac/effectiveAccess.ts          # Delegation overlay
├── permissions.ts                   # Route-level permission helpers
├── membershipPermissions.ts         # UserBoutiqueMembership flags
├── scope/
│   ├── ssot.ts                      # Scope SSOT (canonical)
│   ├── operationalScope.ts          # Operational boutique resolution
│   ├── resolveScope.ts              # Analytical/stored scope
│   ├── scopeContext.ts              # SUPER_ADMIN ?b= override
│   └── scheduleScope.ts             # Schedule-specific scope
├── boutique/resolveOperationalBoutique.ts  # UI preference-aware resolution
├── sales/
│   ├── upsertSalesEntry.ts          # Canonical write (SSOT)
│   ├── readSalesAggregate.ts        # Canonical read (SSOT)
│   ├── syncLedgerToSalesEntry.ts    # Ledger → SalesEntry sync
│   ├── salesEntryWritePrecedence.ts # Source precedence rules
│   ├── salesGovernance.ts           # Approved surfaces registry
│   ├── employeeAssignmentAtDate.ts  # Historical assignment (warnings)
│   ├── ledgerRbac.ts                # Sales-specific RBAC
│   ├── matrixImportParse.ts         # Matrix Excel parser
│   └── yearlyEmployeeSalesImport.ts # Yearly import pipeline
├── targets/
│   ├── importBoutiques.ts           # Boutique target import
│   ├── importEmployees.ts           # Employee target import
│   ├── applyImportPlan.ts           # Shared apply plan validation
│   └── scope.ts                     # Target module scope gate
├── metrics/aggregator.ts            # Dashboard KPI SSOT
├── performance/
│   ├── performanceEngine.ts         # Pure performance math
│   └── hubEngine.ts                 # Performance hub orchestrator
├── tenancy/operationalRoster.ts     # Employee roster SSOT
└── integrations/planner/            # Microsoft Planner integration

prisma/schema.prisma                 # 100 models, 93 migrations
middleware.ts                        # Edge auth + demo write block
```

## Appendix B — Related Existing Documentation

| Document | Relevance |
|----------|-----------|
| `docs/SCOPE_AUDIT.md` | Scope SSOT implementation status |
| `docs/sales-parity-surface-audit.md` | Sales read surface parity |
| `docs/historical-ledger-reconciliation.md` | Executive monthly mixed sources policy |
| `docs/import-center-audit.md` | Import center audit |
| `docs/security-hardening.md` | Prior security work |
| `docs/API_CANONICAL.md` | API conventions |

These documents remain valid reference but may contain outdated route counts. This audit supersedes them for the Architecture Stabilization Phase.
