# Scenario Simulator — Workforce AI

The Scenario Simulator is a decision layer that sits above the Resource Planner and
Schedule Engine v3. Instead of only *recommending* actions, it actually builds several
alternative workforce strategies, re-solves each on a clone of the week, scores the
outcomes, and returns **ranked options** to the manager.

```
Health Check
    ↓
Resource Planner
    ↓
Scenario Simulator   ← this layer
    ↓
Constraint Analyzer
    ↓
Solver
    ↓
Apply
```

## What a scenario is

A scenario is one workforce strategy applied to a **deep clone** of the week's input.
The simulator adjusts the clone (never the database, never the original input), runs the
existing analyzer + solver, and records the outcome. Seven scenario types are generated:

| Type | Strategy | Input adjustment (on the clone) |
| --- | --- | --- |
| `BASELINE` | Current setup as-is | none |
| `MOVE_WEEKLY_OFF` | Shift one weekly off from a shortage day to a quiet day | change `weeklyOffDay` + `unavailability` |
| `REDUCE_LATE_COVERAGE` | Drop the closing hour from 2→1 (policy relaxation) | split the last operating period, lower `minCoverage` |
| `BRIDGE` | One employee covers AM opening + PM closing | enable split, raise split budget + daily hours |
| `OVERTIME` | Minimal rotating overtime on shortage days | raise `maxDailyHours` |
| `EXTERNAL_SUPPORT` | Borrow a guest scoped to shortage days only | add an extra body scoped to shortage dates |
| `HYBRID` | Least-invasive mix of bridge + overtime + limited support | combine the above, in small amounts |

Baseline is always generated first so every alternative can be compared against the
current feasibility. Alternatives are ordered least → most invasive.

> **Note on external support / bridge modelling.** Engine v3's later fill passes
> (split / external / overtime) share a per-day progress guard with the regular pass, so
> employees injected purely as `externalSupportEmployees` are not reliably placed. To keep
> the simulation honest, external support is modelled as an **extra regular body** scoped
> to shortage days (via `syntheticSupportIds`) and reported back as external-support hours.
> This routes the strategy through the functioning regular fill pass without modifying the
> engine.

## How scoring works

Each scenario is scored 0–100 by `lib/schedule/scenarioScoring.ts`, a pure function of
the outcome metrics (no solver, no DB):

| Dimension | Weight | Definition |
| --- | --- | --- |
| Coverage | 40% | 100 if `coverageValid`; otherwise reduced by slot violations and missing hours |
| Fairness | 20% | Fairness Health % from Schedule Quality |
| Fatigue | 15% | Penalizes overtime hours, bridge count, and concentration on one employee |
| Cost | 15% | External support (high), overtime (medium), weekly-off move (low) |
| Simplicity | 10% | Fewer actions score higher; hybrids take a small extra penalty |

```
total = coverage·0.40 + fairness·0.20 + fatigue·0.15 + cost·0.15 + simplicity·0.10
```

Ties break toward the coverage-valid, lower-cost, simpler option so the "best" scenario is
also the most operationally sane.

## What each option means

Every scenario card shows:

- **Score** and a per-dimension breakdown (coverage / fairness / fatigue / cost / simplicity).
- **Actions** — the specific, non-generic steps (e.g. *"Add support Thursday 18:00–22:30"*).
- **Pros / Cons** — derived by comparing the scenario to the baseline (e.g. *"Fixes 18 missing slots"*, *"Adds 2 compensation hours"*).
- **Explanation** — a plain-language reason the strategy helps.
- **Preview** — a modal with the day/employee segment table, affected days, compensation ledger, and any remaining coverage gaps.

## How apply works

- **Preview scenario** — read-only; opens the segment table and compensation ledger.
- **Apply scenario** — routes through the **existing apply gate** in the Schedule Editor.
  The simulator never writes to the database directly. If the chosen scenario does not
  reach full coverage, the UI requires an explicit force confirmation before opening the
  editor.
- **Explain** — toggles the scenario's plain-language rationale.

## API

`POST /api/schedule/v3/scenarios`

```jsonc
// Request
{ "weekStart": "2026-06-15", "maxScenarios": 7 }

// Response
{
  "weekStart": "2026-06-15",
  "bestScenarioId": "hybrid",
  "scenarios": [ /* ranked SimulatedScenario[] */ ],
  "summary": { "totalScenarios": 6, "feasibleScenarios": 3, "bestScore": 91, ... },
  "generatedAt": "2026-07-04T12:00:00.000Z",
  "performance": { "scenariosGenerated": 6, "solves": 6, "totalMs": 812, "capped": false }
}
```

Uses the same input builder as `analyze` / `solve` (`loadGenerateScheduleInputForWeek`).

### Safety caps

- `maxScenarios` — default **7** (route clamps to 10).
- `maxScenarioSolveMs` — default **3000**; used as an overall wall-clock budget guard.
- `maxSolves` — hard cap of **10** scenario solves.
- Baseline always runs so managers see current feasibility even under a zero budget.

## Limitations

- The solver is best-effort and time-boxed; partial solves are used to keep metrics
  measurable on impossible weeks.
- Bridge effectiveness depends on Engine v3's split placement, which is conservative.
- "Apply" opens the editor gate rather than persisting a plan directly — the simulator
  produces a **strategy**, and the solver/editor executes it.
- Scenario metrics are simulated; the final applied schedule is re-validated by the
  existing coverage engine.

## Roadmap

- Let scenarios emit persistence-ready plan actions so "Apply" can pre-fill the editor.
- Per-slot late-coverage relaxation instead of the final hour only.
- Multi-guest external support with real source-boutique scoping.
- Manager-tunable scoring weights.
- Cache scenario results per week to avoid re-solving on revisit.
