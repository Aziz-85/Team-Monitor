# Schedule Constraint Analyzer

Pre-solve feasibility analysis for **Schedule Engine v3**. Runs **before** the constraint solver and explains whether a week can be covered, why not, and what actions would help.

## Purpose

Production solves were timing out when staffing could not meet 30-minute slot coverage. The analyzer answers:

- Can this week be solved with current staff?
- How many staff-hours are required vs available?
- What is the primary blocker (leave, weekly off, Friday rules, Ramadan hours)?
- What should the manager do next?

The analyzer does **not** run the solver and does **not** modify schedules.

## API

```
POST /api/schedule/v3/analyze
```

**Body**

```json
{ "weekStart": "2026-03-07" }
```

**Response**

```json
{
  "weekStart": "2026-03-07",
  "guestShiftCount": 2,
  "analysis": {
    "feasible": false,
    "status": "IMPOSSIBLE",
    "summary": { … },
    "issues": [ … ],
    "recommendations": [ … ]
  },
  "mainReason": "…",
  "recommendedFix": "Add external support employee(s)"
}
```

Uses the same input pipeline as `POST /api/schedule/v3/solve`:

`getScheduleGridForWeek` → `buildGenerateScheduleInput` → `analyzeScheduleConstraints`

## Status values

| Status | Meaning |
|--------|---------|
| `FEASIBLE` | Regular staff headcount and hours appear sufficient for configured operating periods. |
| `NEEDS_SUPPORT` | Solvable with overtime, split shifts, or external support — not with regular staff alone. |
| `IMPOSSIBLE` | Peak minCoverage cannot be met, all staff on leave, or missing hours with external support disabled. |

## What is analyzed

- Operating periods per day (normal, Friday PM-only, Ramadan split periods)
- minCoverage on each 30-minute slot
- Available employees per day (regular + external)
- Leaves, holidays, absences, weekly off
- Max daily hours (normal 8h / Ramadan 6h)
- Friday peak coverage vs availability
- External support pool from guest shifts
- Split / overtime hints when multi-period days exceed regular hours

## Code

| File | Role |
|------|------|
| `lib/schedule/constraintAnalyzer.ts` | `analyzeScheduleConstraints(input)` |
| `lib/schedule/loadScheduleEngineInput.ts` | Shared grid → input loader |
| `app/api/schedule/v3/analyze/route.ts` | HTTP API |
| `components/schedule/ScheduleHealthCheckPanel.tsx` | UI panel (KPIs + decision gates) |
| `__tests__/constraintAnalyzer.test.ts` | Unit tests |

## Running tests

```bash
npx jest __tests__/constraintAnalyzer.test.ts
```

## UI flow (Schedule Health Check)

```
Health Check → Decision → Schedule Solver → Apply
```

1. Week change → preview health check with management KPIs
2. **Solve Schedule** → health check first
3. **FEASIBLE** → “Schedule is feasible.” → auto-run solver
4. **NEEDS_SUPPORT** → recommendations → Continue anyway / Modify constraints / Cancel
5. **IMPOSSIBLE** → block solver → “Run best possible schedule anyway” sends `forcePartialSolve: true`

Optional solve body fields: `preAnalyzed`, `forcePartialSolve` (API-compatible additions).

## Limitations

- Analysis uses aggregate person-hours and peak headcount — it does not simulate shift geometry like the full solver.
- `FEASIBLE` does not guarantee `coverageValid: true` after solve.
- `IMPOSSIBLE` strongly indicates the solver will return violations; use recommendations before solve.
