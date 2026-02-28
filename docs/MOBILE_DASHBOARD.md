# Mobile Manager Dashboard & Team API

Manager dashboard and team today data for the mobile app. **Mobile-only**; does not affect web auth or web UI.

---

## Team Today

**GET** `/api/mobile/team/today?date=YYYY-MM-DD`

- **Auth:** Bearer (mobile JWT). Scope: `boutiqueId` from token.
- **Roles:** MANAGER, ASSISTANT_MANAGER, ADMIN.
- **Response:** `{ date, members: [{ empId, name, role, shift, salesToday, tasksDone, tasksTotal }] }`. Shift: AM | PM | OFF | LEAVE. Data: boutique employees (same as web), roster for shift, SalesEntry per user/date, TaskCompletion and task assignment for that date.

---

## Manager Dashboard

**GET** `/api/mobile/dashboard/manager?date=YYYY-MM-DD`

### Auth

- **Authorization:** `Bearer <accessToken>` (JWT from mobile login).
- Uses `getMobileUserFromRequest`; returns 401 if missing or invalid.
- **Scope:** Strictly scoped to the user’s `boutiqueId` from the JWT. No cross-boutique data.
- **Roles:** MANAGER, ASSISTANT_MANAGER, ADMIN only. EMPLOYEE returns 403.

### Query

| Parameter | Required | Description |
|-----------|----------|-------------|
| `date`    | No       | Date in Riyadh as `YYYY-MM-DD`. Default: today in Asia/Riyadh. |

Date handling:

- Default: today in **Asia/Riyadh** (via `getRiyadhNow()` / `toRiyadhDateString()`).
- If provided, must be `YYYY-MM-DD`; otherwise default is used.
- All DB and range logic uses the same date (Riyadh calendar day → UTC range for that day).

### Response (200)

```json
{
  "date": "2026-02-25",
  "tasks": { "done": 3, "total": 5 },
  "sales": { "achieved": 45000, "target": 50000, "percent": 90 },
  "coverage": {
    "am": 2,
    "pm": 3,
    "isOk": true,
    "policy": "Sat–Thu: PM ≥ AM, min PM 2; Rule: minAM=2 minPM=2"
  }
}
```

| Field | Description |
|-------|-------------|
| `date` | The date used (Riyadh YYYY-MM-DD). |
| `tasks.done` | Number of task completions for that boutique on that date (TaskCompletion, `undoneAt` null, `completedAt` in day range). |
| `tasks.total` | Number of active tasks for that boutique that are “runnable” on that date (by schedule: DAILY / WEEKLY / MONTHLY). |
| `sales.achieved` | Sum of `SalesEntry.amount` for that boutique and `dateKey` (Riyadh day). |
| `sales.target` | Daily target in SAR. **Same source of truth as web:** `BoutiqueMonthlyTarget.amount` for the month + `getDailyTargetForDay(monthTarget, daysInMonth, dayOfMonth)` from `lib/targets/dailyTarget.ts`. Calendar-day distribution (first `remainder` days get base+1, rest get base). Also used by `/api/me/targets`. |
| `sales.percent` | `achieved / target * 100` (rounded). Safe division (0 if target 0). |
| `coverage.am` | Count of AM (MORNING) roster employees for that date and boutique (`rosterForDate`). |
| `coverage.pm` | Count of PM (EVENING) roster employees for that date and boutique. |
| `coverage.isOk` | Policy check: Friday → AM = 0 and PM ≥ rule; Sat–Thu → PM ≥ min PM and PM ≥ AM. |
| `coverage.policy` | Human-readable policy string (e.g. “Sat–Thu: PM ≥ AM, min PM 2” and rule minAM/minPM if present). |

### Errors

| Status | Meaning |
|--------|---------|
| 401    | Missing or invalid Bearer token. |
| 403    | Not MANAGER / ASSISTANT_MANAGER / ADMIN. |
| 500    | Server error (logged). |

### Performance

- Single handler; no N+1.
- Uses parallel `Promise.all` for: tasks list, completion count, sales sum, monthly target, roster, coverage rule.
- Uses `select` / `count` / `aggregate` where possible instead of full `include`.

### Data sources

- **Tasks:** `Task` (active, `boutiqueId`), `TaskSchedule`, `TaskCompletion` (completedAt in day, `undoneAt` null).
- **Sales achieved:** `SalesEntry` (boutiqueId, dateKey) — same as web reports/targets.
- **Sales target:** `BoutiqueMonthlyTarget` (boutiqueId, month) + `lib/targets/dailyTarget.getDailyTargetForDay` — same computation path as web targets page (e.g. `/api/me/targets` uses it for employee daily target; manager dashboard uses it for boutique-level daily target).
- **Coverage:** `rosterForDate(date, { boutiqueIds: [boutiqueId] })` (AM/PM counts), `CoverageRule` (dayOfWeek, optional boutiqueId). Policy matches current system (PM ≥ AM, min PM, Friday PM-only).

---

## Debug: target source of truth

**GET** `/api/mobile/dashboard/targets/source?date=YYYY-MM-DD`

Internal debugging endpoint to inspect how the daily target is computed for the manager dashboard. Same computation path as the web (`lib/targets/dailyTarget.getDailyTargetForDay`).

### Auth

- **Authorization:** `Bearer <accessToken>` (mobile JWT).
- **Scope:** User’s `boutiqueId` from the token.
- **Roles:** **ADMIN** and **MANAGER** only. ASSISTANT_MANAGER and EMPLOYEE return 403.

### Query

| Parameter | Required | Description |
|-----------|----------|-------------|
| `date`    | No       | Date in Riyadh `YYYY-MM-DD`. Default: today (Asia/Riyadh). |

### Response (200)

Example:

```json
{
  "date": "2026-02-25",
  "boutiqueId": "bout_dhhrn_001",
  "dailyTarget": 16129,
  "source": {
    "kind": "computed_from_monthly",
    "table": "BoutiqueMonthlyTarget",
    "recordIds": ["clxx1234567890"],
    "notes": "Same as web: lib/targets/dailyTarget.getDailyTargetForDay. Used by /api/me/targets and manager dashboard."
  },
  "computed": {
    "monthlyTarget": 450000,
    "calendarDays": 28,
    "formula": "base = floor(monthlyTarget / calendarDays); remainder = monthlyTarget - base*calendarDays; dailyTarget = base + (dayOfMonth <= remainder ? 1 : 0)"
  }
}
```

| Field | Description |
|-------|-------------|
| `date` | Date used (Riyadh YYYY-MM-DD). |
| `boutiqueId` | Boutique scope (from token). |
| `dailyTarget` | Computed daily target in SAR (same as manager dashboard `sales.target`). |
| `source.kind` | `computed_from_monthly` — no daily target table; derived from monthly. |
| `source.table` | DB table for monthly target. |
| `source.recordIds` | IDs of records used (e.g. BoutiqueMonthlyTarget id); no user IDs. |
| `source.notes` | Short explanation. |
| `computed.monthlyTarget` | Boutique monthly target (SAR) for the month. |
| `computed.calendarDays` | Days in that month (for distribution). |
| `computed.formula` | Human-readable formula. |

### Errors

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid token. |
| 403 | Not ADMIN or MANAGER. |
| 500 | Server error. |
