# Schedule Policy Engine

Centralized policy resolution for Schedule Engine v3. All consumers should call `getSchedulePolicy(input)` rather than duplicating constants.

**Source:** `lib/schedule/policyEngine.ts`

## Purpose

Scheduling rules (daily hours, slot intervals, split limits, Friday behavior, coverage periods, overtime/support priority) were previously scattered across:

- `operatingPeriods.ts`
- `buildInput.ts` / `DEFAULT_GENERATE_SETTINGS`
- Engine settings
- UI copy

The Policy Engine consolidates these while preserving existing APIs — `operatingPeriods.ts` and `types.ts` delegate to policy helpers.

## API

### `getSchedulePolicy(input)`

**Input:** `{ days: DayOperatingConfig[], settings?: GenerateScheduleSettings }`

**Output:**

```typescript
{
  mode: 'normal' | 'ramadan',
  maxDailyHours: number,           // 8 normal, 6 ramadan
  slotIntervalMinutes: 30,
  split: {
    allowed: true,
    maxDaysPerEmployeePerWeek: 2,
  },
  overtime: {
    allowed: true,
    maxHoursPerDay: null,
    priority: 'last_resort',
  },
  externalSupport: {
    allowed: true,
    priority: 'high',
  },
  friday: {
    mode: 'pm_only' | 'full_day' | 'dynamic',
  },
  coverage: {
    defaultMinCoverage: 2,
    periods: { normalSatThu, normalFri, ramadanSatThu, ramadanFri },
  },
}
```

### Helpers

| Function | Use |
|----------|-----|
| `operatingPeriodsForPolicy(dayOfWeek, mode)` | Build periods for a day |
| `generateSettingsFromPolicy(policy)` | Map policy → `GenerateScheduleSettings` |
| `getDefaultGenerateSettings()` | Default engine settings (replaces scattered constants) |

## Rules

| Rule | Normal | Ramadan |
|------|--------|---------|
| Max daily hours | 8 | 6 |
| Slot interval | 30 min | 30 min |
| Split shifts | Allowed, max 2 days/emp/week | Same |
| Friday coverage | PM only (16:00–22:30) | AM + PM blocks |
| External support | Allowed, high priority | Same |
| Overtime | Allowed, last resort only | Same |
| Default min coverage | 2 per operating period | 2 |

## Friday mode

- **`pm_only`** — Normal week Friday: single PM period.
- **`full_day`** — Ramadan week Friday: AM + PM periods.
- **`dynamic`** — Week spans Ramadan boundary; Friday resolved per-day from `isRamadan`.

## Integration points

| Consumer | Usage |
|----------|-------|
| `operatingPeriods.ts` | `operatingPeriodsForPolicy` |
| `buildInput.ts` | `generateSettingsFromPolicy(getSchedulePolicy(...))` |
| `constraintAnalyzer.ts` | Policy-aware hours and coverage |
| `scheduleHealthKpis.ts` | Via analyzer |
| `POST /api/schedule/v3/analyze` | Returns `policy` in JSON |
| `POST /api/schedule/v3/solve` | Returns `policy` in JSON |
| Schedule Solver UI | Displays policy-driven KPIs and periods |

## Extending policy

To add boutique-specific overrides later:

1. Load overrides from DB in analyze/solve routes.
2. Pass merged `settings` into `getSchedulePolicy({ days, settings })`.
3. Keep period templates in policy engine; overrides should patch settings, not fork solver.

## Constants (exported)

- `NORMAL_MAX_DAILY_HOURS = 8`
- `RAMADAN_MAX_DAILY_HOURS = 6`
- `SLOT_INTERVAL_MINUTES = 30`
- `DEFAULT_MIN_COVERAGE = 2`
- `MAX_SPLIT_DAYS = 2`
- `FRIDAY_DOW = 5`

## Tests

`__tests__/policyEngine.test.ts` — normal/ramadan modes, Friday periods, settings parity.
