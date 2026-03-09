# Microsoft Planner Integration — Phase 1 Audit Report

## 1. Current Task Models

| Model | Key Fields | Notes |
|-------|------------|-------|
| **Task** | id, boutiqueId, name, active, **taskKey** (unique), completionSource, importedCompletionAt | taskKey used for Planner matching |
| **TaskPlan** | taskId, primaryEmpId, backup1EmpId, backup2EmpId | Assignments |
| **TaskSchedule** | taskId, type (DAILY/WEEKLY/MONTHLY), weeklyDays, monthlyDay, isLastDay | Recurrence |
| **TaskCompletion** | taskId, userId, completedAt, undoneAt | Unique [taskId, userId] |

## 2. Task APIs

- `GET/POST /api/tasks/list` — list tasks (operational scope)
- `POST /api/tasks/completion` — toggle completion
- `GET /api/tasks/monitor` — Task Monitor
- `GET /api/tasks/day`, `range`, `my-today` — various views
- `GET/POST/PATCH/DELETE /api/tasks/setup/*` — task CRUD
- `POST /api/sync/planner/apply` — manual file-based apply (MANAGER, ADMIN)
- `POST /api/sync/planner/compare` — compare without apply

## 3. Employee Model

- **Employee**: empId (PK), boutiqueId, name, email, team, position, active
- **User**: empId (unique), role, boutiqueId — links to Employee

## 4. Role / Permission / Scope

- **requireRole(roles)** — throws AuthError
- **getOperationalScope(request)** — session boutique; AREA_MANAGER gets allowedBoutiqueIds
- **getScheduleScope(request)** — schedule scope for sync
- **getUserAllowedBoutiqueIds(userId)** — for AREA_MANAGER
- **requireAdmin()** — ADMIN, SUPER_ADMIN only
- Planner sync: MANAGER, ADMIN (sync/planner routes)

## 5. Settings / Config

- **SystemConfig**: key, valueJson (e.g. DEFAULT_BOUTIQUE_ID)
- No Planner integration config yet
- No MICROSOFT_* env vars in codebase

## 6. Existing Integration / Webhook

- **PlannerImportBatch**, **PlannerImportRow** — manual CSV/XLSX import
- **lib/sync/comparePlanner** — parsePlannerFile, parsePlannerCsv, runCompare
- **lib/sync/applyCompletions** — apply planner completions by taskKey + dueDate + assignee
- **lib/sync/taskKey** — extractTaskKeyFromTitle, buildTaskKey (format: DT-{year}-Q{quarter}-W{weekNum}-{typeCode}-{zone}-{seq4})
- No webhook patterns

## 7. Audit / Sync Log

- **AuditLog**: module, action, actorUserId, beforeJson, afterJson, etc.
- No dedicated sync log table

## 8. Admin Settings Pages

- `/admin/system` — default boutique (AdminSystemClient)
- `/admin/administration/settings` — redirects to /admin/system
- `/sync/planner` — manual Planner sync (file upload)

## 9. Safest Extension Points

1. **Prisma**: Add new models only; do not modify Task, TaskCompletion, Employee
2. **lib/integrations/planner/** — new directory
3. **app/api/integrations/planner/** — new API routes
4. **Admin page**: `/admin/administration/integrations/planner` or `/admin/integrations/planner`
