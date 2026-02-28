# Hidden / Disabled Features Discovery

**Generated:** 2025-02-14 | **Purpose:** Identify features that exist but are not accessible or are incomplete.

---

## 1. Routes Not Linked in Navigation

| Route | File | Why Hidden | To Activate |
|-------|------|------------|-------------|
| `/schedule/editor` | `app/(dashboard)/schedule/editor/page.tsx` | **Now in nav** as "Schedule (day editor)" (P1). Alternative day-by-day editor; same roles as `/schedule/edit`. | — |
| `/inventory/zones/weekly` | `app/(dashboard)/inventory/zones/weekly/page.tsx` | Not in nav | May be sub-view of /inventory/zones. Check if linked from zones page. |
| `/change-password` | `app/(auth)/change-password/page.tsx` | In footer link; not in nav groups | Intentional — user menu. |

---

## 2. Feature Flags / Env Toggles

| Search | Result |
|--------|--------|
| `FEATURE_` | None found |
| `feature.?flag` | None found |
| `process.env.NODE_ENV` | Used for dev-only UI (e.g. "Guests: N" badge in dev) | `ScheduleViewClient.tsx` |
| `process.env.NODE_ENV === 'development'` | Console logs, dev badges | Not a feature flag |

**No explicit feature flags found.**

---

## 3. Role-Locked Pages (No Nav Link for Some Roles)

| Page | Roles | Nav Link | Note |
|------|-------|----------|------|
| `/schedule/edit` | MANAGER, ASSISTANT_MANAGER, ADMIN | Yes (filtered by canEditSchedule) | EMPLOYEE redirected if direct access |
| `/approvals` | MANAGER, ADMIN | Yes (filtered by canApproveWeek) | Hidden if !canApproveWeek |
| `/admin/*` | ADMIN (most), MANAGER (some) | Yes | Role-specific |

---

## 4. Commented / Disabled UI Blocks

| Search | Result |
|--------|--------|
| `disabled` | Used for loading states, not feature disable |
| `// TODO` | Scattered; not feature-disabling |
| `// FIXME` | Scattered |

**No large commented-out feature blocks found.**

---

## 5. API Endpoints Possibly Never Called

| Endpoint | Possible Callers | Status |
|----------|------------------|--------|
| `/api/schedule/week` | /schedule/editor | ✅ Used |
| /api/suggestions/coverage | /schedule/editor | ✅ Used |
| /api/suggestions/coverage/week | Grep | UNKNOWN |
| /api/executive/alerts` | Grep | Executive alerts |
| /api/executive/anomalies` | Grep | Executive |
| /api/executive/trends` | Grep | Executive |
| /api/audit` | Schedule audit | ✅ Used |
| /api/locale` | Grep | UNKNOWN |
| /api/employees/[empId]/change-team` | Grep | UNKNOWN |
| /api/employees/[empId]/change-team/preview` | Grep | UNKNOWN |

---

## 6. Unfinished / Placeholder

| Location | Evidence |
|----------|----------|
| Placeholder text | "Apply blocked" — validation message when import has errors; apply is wired |
| Buttons that do nothing | None found |

---

## 7. Summary

| Category | Count |
|----------|-------|
| Routes not in nav | 1 (/inventory/zones/weekly; /schedule/editor now in nav) |
| Feature flags | 0 |
| Role-locked (no nav) | 0 (all have nav when role matches) |
| Commented-out features | 0 |
| Unused APIs | UNKNOWN (need full grep) |

**Recommendation:** `/schedule/editor` is now in nav (P1). See `docs/audit/API_ENDPOINTS.md` for API usage.
