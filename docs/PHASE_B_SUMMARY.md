# Phase B — Rashid Coverage + Friday Rule + Excel View + Smart Warnings

## B1) Rashid Boutique coverage as first-class schedule assignment

- **Shift options** in Schedule Editor: MORNING, EVENING, NONE, COVER_RASHID_AM, COVER_RASHID_PM (already in Prisma `OverrideShift` enum and editor dropdown).
- **Persistence**: Existing `ShiftOverride` model; override create/update and batch grid save use same mechanism with audit logging (`logAudit` on overrides and `SCHEDULE_BATCH_SAVE` on grid save).
- **Friday**: MORNING and COVER_RASHID_AM are not shown in the dropdown for Friday cells; API rejects them with 400 "Friday is PM-only. AM is not allowed." and grid/save skips them and returns `skipped` / `skippedDetails`.

## B2) Rashid coverage in Schedule View

- **Excel View**: Column order is Date, Day, Morning slots, Evening slots, Rashid AM slots, Rashid PM slots, **Coverage** (one column with total or "X AM / Y PM"), **AM** (boutique count), **PM** (boutique count) at the far right. Headers use i18n: `schedule.rashidAm`, `schedule.rashidPm`, `schedule.rashidCoverage`, `schedule.amCount`, `schedule.pmCount`.
- **Teams View**: Added **Rashid Coverage** column (full grid) showing who is covering Rashid AM/PM per day with labels; non–full-grid view shows Rashid names in the same row as AM/PM.
- **Grid View**: Cells already show MORNING, EVENING, Cover Rashid AM/PM, NONE with i18n labels.

## B3) Counting logic with Rashid

- **Source of truth**: `lib/services/scheduleGrid.ts` — `computeDayCountsFromCells` and grid build:
  - Boutique AM = WORK + effectiveShift MORNING only.
  - Boutique PM = WORK + effectiveShift EVENING only.
  - Rashid AM/PM = WORK + effectiveShift COVER_RASHID_AM / COVER_RASHID_PM.
  - LEAVE/OFF/ABSENT never counted.
- **Editor** `draftCounts` in `ScheduleEditClient.tsx` only increments AM/PM for MORNING/EVENING (excludes cover).
- **Unit tests** (`__tests__/schedule-counts.test.ts`):
  - Coverage count increments only for COVER_RASHID_AM and COVER_RASHID_PM.
  - Boutique AM/PM counts exclude cover shifts (mixed MORNING, EVENING, COVER_RASHID_AM, COVER_RASHID_PM).

## B4) Friday rule (hard constraint)

- **Editor**: Friday cells do not show MORNING or COVER_RASHID_AM in the dropdown; cell has `title={t('schedule.fridayNoMorning')}`.
- **API**: `isAmShiftForbiddenOnDate(date, shift)` in `lib/services/shift.ts`; overrides POST and grid/save reject or skip MORNING/COVER_RASHID_AM on Friday. Grid/save returns `skipped` and `skippedDetails` so the client can show "X skipped (Friday: morning not allowed)".
- **Coverage rules**: Friday has `minAm: 0` in grid days; validation skips MIN_AM and AM_GT_PM for Friday (AM is always 0).

## B5) Smart warnings panel

- **Location**: Schedule Editor right panel (and Schedule View Grid view header), same style as Phase A coverage panel.
- **Rules**:
  1. Boutique AM ≤ Boutique PM (except Friday): shown as RASHID_OVERFLOW when AM > PM (i18n: `schedule.warningRashidOverflow`).
  2. Boutique AM ≥ MinAM except Friday: MIN_AM warning when AM < minAm (i18n: `schedule.warningMinAm`).
  3. Too many at Rashid (PM below AM or below minimum): same RASHID_OVERFLOW when AM > PM; MIN_PM when PM < minPm (i18n: `schedule.warningMinPm`).
- **UI**: Clickable pills (day + reason); RASHID_OVERFLOW in red, others in amber. Focus day on click.

## B6) i18n (EN/AR)

- **Added** in `messages/en.json` and `messages/ar.json` under `schedule`:
  - `rashidAm`, `rashidPm`, `rashidCoverage` (column/header).
  - `fridayNoMorning` (Friday morning not allowed).
  - `warningAmGtPm`, `warningMinAm`, `warningRashidOverflow`, `warningMinPm` (warning labels).
- Cover Rashid AM/PM already had `coverRashidAm`, `coverRashidPm`.

## B7) RBAC

- **Schedule Editor**: Only MANAGER, ASSISTANT_MANAGER, ADMIN (via `canEditSchedule`); EMPLOYEE redirected to `/schedule/view` on both `/schedule/edit` and `/schedule/editor`.
- **Override write APIs**: POST/PATCH overrides and POST grid/save require MANAGER/ASSISTANT_MANAGER/ADMIN; EMPLOYEE receives 403.
- **Nav**: Editor link shown only for roles with `canEditSchedule`; EMPLOYEE can only view.

---

## Files touched (Phase B)

- `messages/en.json`, `messages/ar.json` — i18n keys for Rashid, Friday, warnings.
- `app/(dashboard)/schedule/view/ScheduleViewClient.tsx` — Excel headers i18n; Teams view Rashid column and names; validations with Friday skip, MIN_PM, i18n messages.
- `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` — Validations (RASHID_OVERFLOW, MIN_AM, MIN_PM, Friday skip); Friday tooltip; save toast for skipped Friday AM.
- `app/api/schedule/week/grid/save/route.ts` — Return `skipped` and `skippedDetails` when Friday AM is skipped.
- `__tests__/schedule-counts.test.ts` — Tests: coverage count only for cover shifts; boutique counts exclude cover shifts.

No Prisma migration: schema already had `COVER_RASHID_AM` and `COVER_RASHID_PM` in `OverrideShift`.

---

## Manual test checklist (Phase B)

1. **Friday**: Pick Friday; verify dropdown does **not** show Morning or Cover Rashid AM. Optionally try to save Friday AM via API → 400 or skipped with message.
2. **Rashid in View**: Assign Cover Rashid PM on a weekday; confirm it appears in Schedule View (Excel/Teams/Grid) and coverage count increments; boutique AM/PM counts do **not** include that person.
3. **Boutique counts**: Confirm boutique AM/PM rows in editor and view only count MORNING/EVENING, not COVER_RASHID_*.
4. **Warnings**: Create a day where AM > PM (e.g. move several to Rashid PM); confirm RASHID_OVERFLOW (or equivalent) warning appears. Check MIN_AM when AM < minAm (non-Friday) and MIN_PM when PM < minPm.
5. **Employee**: Log in as EMPLOYEE; confirm cannot open schedule editor (redirect to view); cannot save overrides (API 403).
