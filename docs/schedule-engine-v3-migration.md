# Schedule Engine v3 — Migration Report

Date: 2026-07-02

## Objective

One source of truth for all scheduling calculation. Before v3, six subsystems computed
coverage independently: the old planner, old coverage validation, grid counters, the new
Generate Schedule engine, the assistant, and audit. After v3 there is a single pipeline:

```
Schedule Engine        lib/schedule/generateSchedule/engine.ts
      ↓
Validation Engine      lib/schedule/generateSchedule/timeSlots.ts (30-min slots)
                       lib/schedule/timeCoverageValidation.ts
      ↓
Coverage Engine        lib/schedule/segmentCoverage.ts (AM/PM = projection of segments)
      ↓
Fairness Engine        lib/schedule/generateSchedule/fairness.ts
      ↓
Persistence            lib/schedule/shiftOverrideSegments.ts (ShiftOverrideSegment)
                       lib/services/scheduleApply.ts
      ↓
Grid (renderer)        lib/services/scheduleGrid.ts — exposes engine output, calculates nothing new
      ↓
Audit                  reads validation output recorded at apply time
```

Facade: `lib/schedule/engine/index.ts` re-exports the entire pipeline. New code must import
from this boundary.

## Requirement-by-requirement status

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Operating periods from configuration only (normal Sat–Thu 09:30–22:30, Fri 16:00–22:30; Ramadan 11:30–17:30 + 20:30–02:30) | `operatingPeriods.ts`; no hardcoded Friday/Ramadan logic in the pipeline |
| 2 | 30-minute time slots, validated per slot | `buildTimeSlots` + `validateCoverage`; every consumer reads slot violations |
| 3 | Segments on every assignment; split = two segments; never reconstructed when saved | Engine emits segments; persisted on apply; grid loads them; synthetic SPLIT reconstruction removed |
| 4 | `ShiftOverrideSegment` table | Prisma model + migration `20260701120000_shift_override_segments` |
| 5 | Grid is a renderer only | Grid loads segments and returns `counts`, `dayCountContexts`, `timeCoverage`, `externalCoverageShifts`; UI clients render engine output |
| 6 | Coverage from segments, not shift type | `segmentCoverage.ts` + `timeCoverageValidation.ts`; enum used only as last-resort fallback for rows with no saved segments |
| 7 | Audit reads coverage validation, no second calculation | `SCHEDULE_PLAN_APPLY` and `WEEK_SAVE` audit entries embed the engine validation result |
| 8 | Generate from scratch (`preserveExisting = false` default) | `buildInput.ts` / `engine.ts` |
| 9 | Fairness across morning/evening/Friday/split/overtime/weekly-off/hours/history | `fairness.ts` penalties + weekly-off scenario search in `engine.ts` |
| 10 | External support behaves like a normal employee | Same candidate type; counts identically toward slot coverage once in the pool (never auto-added) |
| 11 | Dynamic rules (staff count, hours, Ramadan, Friday, store rules) | All from config/DB (`operatingPeriods.ts`, `CoverageRule`, `RAMADAN_START/END` env) |
| 12 | Before Apply: `coverageValid == true` or reject with slot violations | `applySchedulePlanActions` gate → HTTP 422 `COVERAGE_INVALID` + `slotViolations`; UI shows them with explicit "Apply anyway" override |

## Duplicated calculators removed or demoted

| Site | Before | After |
|------|--------|-------|
| `lib/services/schedulePlanner.ts` (old planner, ~980 lines) | Full AM/PM scenario simulation (`buildSchedulePlan`, `cloneSim`, `detectIssues`, `tryFixIssue`, …) | Deleted. File now holds only the plan contract types + `planToAiContext`. Plans come exclusively from `buildSchedulePlanFromGenerate` |
| `lib/services/scheduleEditorExcel.ts` | Independent count/slot layout calculation | Deleted (dead code, no importers) |
| `lib/services/roster.ts` | Enum switch (`MORNING`→AM …) + hardcoded warning rules | Segment projection via `shiftAmPmContribution`; warnings via policy layer; exposes engine `slotViolations` |
| `lib/services/coverageValidation.ts` | Own AM/PM math over roster | Projection of engine output + `SLOT_COVERAGE` results read from grid validation |
| `lib/schedule/coveragePolicy.ts` | "Canonical coverage policy" | Demoted to legacy AM/PM bucket warning layer; documented as not authoritative |
| `lib/schedule/shiftRules.ts` `incrementCountsForWorkingShift` | Primary counter | `@deprecated` fallback only for calls without `DayCountContext` |
| `lib/schedule/segmentCoverage.ts` synthetic SPLIT | Fixed 09:30–13:30 + 18:30–22:30 blocks | Removed; saved segments preferred, label-only AM/PM fallback |

## Backward compatibility

- `ValidationResult` keeps all legacy types (`MIN_AM`, `MIN_PM`, `AM_GT_PM`, `AM_ON_FRIDAY`,
  `PM_NOT_ABOVE_AM`); `SLOT_COVERAGE` is additive. Home/dashboard/executive/reminders/export
  consumers work unchanged.
- `SchedulePlanResult` / `PlanAction` shapes unchanged — assistant modal & chat routes unchanged.
- Rows without saved segments still count via enum-derived segments (pre-v3 data keeps working).
- Manual grid saves (`/api/schedule/week/grid/save`) are not hard-blocked (users must be able to
  fix an invalid week incrementally); the post-save engine validation snapshot is recorded in audit.
- `force: true` on plan apply allows an explicit, audited override when staffing is mathematically
  impossible.

## File-by-file change log

### New
| File | Purpose |
|------|---------|
| `lib/schedule/engine/index.ts` | Engine v3 facade — single import boundary for the whole pipeline |
| `lib/schedule/shiftOverrideSegments.ts` | Segment persistence (replace/load) |
| `lib/schedule/timeCoverageValidation.ts` | Slot validation for grid rows from saved segments |
| `prisma/migrations/20260701120000_shift_override_segments/migration.sql` | `ShiftOverrideSegment` table |
| `__tests__/schedulePlanApplyGate.test.ts` | Apply gate simulation tests |
| `__tests__/timeCoverageValidation.test.ts` | Slot validation tests |
| `docs/schedule-engine-v3-migration.md` | This report |

### Rewritten
| File | Change |
|------|--------|
| `lib/services/schedulePlanner.ts` | Old planner deleted; contract types + AI context only |
| `lib/services/roster.ts` | Reads engine grid; segment-based AM/PM membership; policy-derived warnings; exposes `slotViolations` |
| `lib/services/coverageValidation.ts` | Maps engine output to legacy validation types; adds `SLOT_COVERAGE` |
| `lib/services/schedulePlannerApply.ts` | Takes full grid; `validatePlanCoverage` simulation; `COVERAGE_INVALID` gate; audit embeds validation result |

### Modified
| File | Change |
|------|--------|
| `prisma/schema.prisma` | `ShiftOverrideSegment` model + relation |
| `lib/schedule/generateSchedule/types.ts` | `preserveExisting` option; segments on results |
| `lib/schedule/generateSchedule/buildInput.ts` | `preserveExisting` default `false` |
| `lib/schedule/generateSchedule/engine.ts` | Preserve-current gated behind `preserveExisting`; overtime-aware slot extension |
| `lib/schedule/generateSchedule/timeSlots.ts` | Non-contiguous split segments in one operating period |
| `lib/schedule/generateSchedule/planBridge.ts` | Counts-after simulation uses action segments |
| `lib/schedule/segmentCoverage.ts` | Synthetic SPLIT blocks removed; explicit segments preferred |
| `lib/schedule/coveragePolicy.ts` | Demoted to legacy bucket-warning layer (docs) |
| `lib/schedule/shiftRules.ts` | Legacy counter marked `@deprecated` fallback |
| `lib/services/scheduleGrid.ts` | Loads segments into `GridCell.segments`; returns `dayCountContexts`, `timeCoverage`, `externalCoverageShifts`; segment-aware counts |
| `lib/services/scheduleApply.ts` | Persists segments via `replaceOverrideSegments`; WEEK_SAVE audit records engine validation snapshot |
| `app/api/schedule/week/plan/apply/route.ts` | Passes full grid; `force` flag; 422 + `slotViolations` on rejection |
| `components/schedule/ScheduleAssistantModal.tsx` | Displays blocking slot violations; explicit "Apply anyway" |
| `app/(dashboard)/schedule/SchedulePageClient.tsx` | Uses `dayCountContexts` for counts; renders `SLOT_COVERAGE` warnings |
| `app/(dashboard)/schedule/edit/ScheduleEditClient.tsx` | Same; draft edits re-validated client-side against slots |
| `app/(dashboard)/schedule/view/ScheduleViewClient.tsx` | Renders engine `timeCoverage` violations |
| `__tests__/segmentCoverage.test.ts`, `__tests__/generateSchedule-timeSlots.test.ts` | Updated for v3 behavior |

### Deleted
| File | Reason |
|------|--------|
| `lib/services/scheduleEditorExcel.ts` | Unused duplicate count/slot calculation |

## Verification

- `npm test`: 40 suites pass. 5 failing suites (`post-login-path`, `executive-monthly-scope`,
  `executive-insights-scope`, `metrics-crosspage`, `schedule-boutique-scope`) fail identically
  on the pre-change tree (verified via stash) — pre-existing, unrelated (one needs a live DB with
  the SPLIT enum migration applied).
- `npm run build`: passes (types + lint).

## Deploy

```bash
git pull
npx prisma migrate deploy   # ShiftOverrideSegment
npm run build
pm2 restart team-monitor
```
