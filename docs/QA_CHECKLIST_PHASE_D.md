# Phase D — Final QA Checklist (Mandatory)

Before closing Phase D, manually verify the following. No shortcuts.

---

## 1. Saturday & Friday counts

- [ ] Pick a week; note Saturday and Friday in Schedule View (Excel or Grid).
- [ ] **Saturday:** AM/PM counts match the number of people actually in MORNING and EVENING (no Rashid cover in boutique counts).
- [ ] **Friday:** AM count is 0 (or no morning column used). PM count is correct. No one shows as MORNING or Cover Rashid AM on Friday.

---

## 2. Coverage never leaks into boutique AM/PM

- [ ] Assign at least one person to **Cover Rashid AM** and one to **Cover Rashid PM** on a weekday.
- [ ] In Schedule View, confirm the **Rashid Coverage** column (or total) increases.
- [ ] Confirm **boutique AM** and **boutique PM** counts do **not** include those people (AM/PM count rows unchanged for that day when only Rashid assignments were added).

---

## 3. Employee role cannot edit (including via API)

- [ ] Log in as **EMPLOYEE**.
- [ ] Navigate directly to `/schedule/edit` or `/schedule/editor` — must redirect to schedule view (or 403).
- [ ] In the app, confirm the Schedule **Editor** link is not visible in the nav.
- [ ] (Optional) As EMPLOYEE, call `POST /api/schedule/week/grid/save` or `POST /api/overrides` with valid payload — response must be **401** or **403**; no change applied.

---

## 4. Manager edits reflect correctly

- [ ] Log in as **MANAGER** (or ASSISTANT_MANAGER / ADMIN).
- [ ] Open Schedule Editor; change one or more cells (e.g. MORNING → EVENING, or set Cover Rashid PM).
- [ ] Save with a reason.
- [ ] Confirm toast shows success and counts update immediately.
- [ ] Reload or open Schedule View — same counts and assignments appear (no mismatch).

---

## 5. Arabic RTL

- [ ] Switch language to **Arabic** (if available in UI).
- [ ] Open Schedule View and Schedule Editor; confirm layout does not break (table, headers, counts).
- [ ] Confirm validation/warning messages appear in Arabic where translated.
- [ ] Confirm no logic errors (e.g. wrong day or wrong count) due to RTL.

---

## 6. No console errors on normal usage

- [ ] Open browser DevTools → Console.
- [ ] As Manager: open Schedule View, switch Excel/Teams/Grid, open Schedule Editor, change week, save changes.
- [ ] As Employee: open Schedule View, open own tasks/inventory.
- [ ] Confirm **no red errors** in console during normal flows (warnings are acceptable if documented).

---

## Sign-off

- [ ] All items above checked.
- [ ] Tests: `npm test` passes (schedule-counts, rbac-schedule, api-403, tasks).
- [ ] Build: `npm run build` succeeds.

**Date:** _______________  
**Verified by:** _______________
