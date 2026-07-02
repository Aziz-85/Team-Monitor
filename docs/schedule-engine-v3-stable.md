# Schedule Engine v3 — Stable Architecture

**Version label:** Schedule Engine 3.0 Stable (Team Monitor package remains `2.3.x` until release cut)

Schedule Engine v3 is the single source of truth for weekly schedule generation in Team Monitor. Legacy AM/PM planner paths are retired; all solve, validate, and apply flows go through the v3 pipeline.

## Architecture overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Policy Engine  │────▶│  Input Builder   │────▶│ Constraint      │
│  policyEngine   │     │  buildInput      │     │ Analyzer        │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              ▼
│  Apply (plan)   │◀────│  Solver Engine   │◀──── Health Check UI
│  coverage gate  │     │  generateSchedule│      Decision gate
└─────────────────┘     └──────────────────┘
```

### Core modules

| Module | Path | Role |
|--------|------|------|
| Policy Engine | `lib/schedule/policyEngine.ts` | Central policy resolution (hours, coverage, split, overtime, Friday) |
| Input builder | `lib/schedule/generateSchedule/buildInput.ts` | Grid + guests → `GenerateScheduleInput` |
| Constraint Analyzer | `lib/schedule/constraintAnalyzer.ts` | Pre-solve feasibility, insights, ranked recommendations |
| Solver | `lib/schedule/generateSchedule/engine.ts` | Scenario search with hard performance caps |
| Quality metrics | `lib/schedule/scheduleQuality.ts` | Management-friendly % KPIs |
| Health KPIs | `lib/schedule/scheduleHealthKpis.ts` | Pre-solve KPI cards for UI |
| Engine facade | `lib/schedule/engine/index.ts` | Public exports for v3 consumers |

## Data flow

### Week change (preview only)

1. User selects week on Schedule Solver (`/schedule/v3`).
2. Client calls `POST /api/schedule/v3/analyze`.
3. Server loads grid via `loadScheduleEngineInput` / analyze route.
4. `analyzeScheduleConstraints(input)` runs using policy from `getSchedulePolicy(input)`.
5. UI shows Health Check panel with five % KPIs — **solver is not run**.

### Solve Schedule

1. User clicks **Solve Schedule**.
2. Analyze runs first (or reuses cached analysis).
3. **FEASIBLE** → show message, auto-run solver with `preAnalyzed: true`.
4. **NEEDS_SUPPORT** → decision gate: Continue anyway / Modify constraints / Cancel.
5. **IMPOSSIBLE** → block auto-solve; show why, missing hours/slots, impossible days; optional **Run best possible schedule anyway** (`forcePartialSolve: true`).

### Apply

1. Apply enabled only when a solver result exists.
2. `coverageValid` must be true unless user confirms force partial apply.
3. Plan actions come from `generateResultToPlanActions` — no duplicate scheduling logic.

## Policy engine

All scheduling rules resolve through `getSchedulePolicy(input)`. See [schedule-policy-engine.md](./schedule-policy-engine.md).

## Health check

Pre-solve analysis produces:

- Status: `FEASIBLE` | `NEEDS_SUPPORT` | `IMPOSSIBLE`
- Summary: required/available hours, coverage slot units
- Insights: why impossible, whether support/overtime/split/off/leave changes would help
- Ranked recommendations (1–6)

Management KPIs (percentages, not raw fairness):

- Schedule Quality %
- Coverage Health %
- Staff Availability %
- Constraint Health %
- Fairness Health %

Raw internal fairness score appears only in **Technical Details** post-solve.

## Analyzer

`analyzeScheduleConstraints` explains blockers before expensive solve:

- Peak coverage shortage, leave overload, weekly-off conflicts
- Per-day impossible dates
- Estimated effect per recommendation

Recommendation priority:

1. Add external support
2. Allow overtime
3. Adjust weekly off
4. Allow additional split day
5. Reduce late-hour coverage
6. Adjust leave

## Solver

The solver is **not rewritten** in v3 stable. Safety limits (unchanged):

| Limit | Value |
|-------|-------|
| `MAX_SCENARIOS` | 8 |
| `MAX_ITERATIONS_PER_DAY` | 300 |
| `MAX_TOTAL_ITERATIONS` | 5000 |
| `MAX_SOLVE_MS` | 2500 |

Outputs: `solverStatus`, `stoppedReason`, `iterationsByDay`, `iterationsByScenario`, performance instrumentation.

## Apply gate

- Apply button disabled until solve completes.
- If `coverageValid === false`, apply blocked unless explicit force-partial confirmation.
- Audit and validation read engine output — no recalculation.

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/schedule/v3/analyze` | Health check; returns `analysis`, `policy`, `qualityPercents` |
| `POST /api/schedule/v3/solve` | Streamed solve; accepts `preAnalyzed`, `forcePartialSolve` |

## Known limitations

- Analyzer uses simplified capacity model vs full solver — edge cases may differ slightly.
- Overtime is policy-allowed as last resort but not auto-applied by analyzer alone.
- Ramadan transitions mid-week use per-day `isRamadan` flags from grid/ramadan range.
- Benchmark scenarios depend on boutique seed data; empty DB yields minimal runs.
- `forcePartialSolve` may produce partial coverage; apply gate still warns.

## Roadmap (post-stable)

- Persist policy overrides per boutique in database
- Analyzer parity tests against solver outcomes
- Scheduled health-check cron for upcoming weeks
- PR merge to `main` after QA sign-off on `feature/schedule-engine-profiling`

## Related docs

- [Policy Engine](./schedule-policy-engine.md)
- [Production Readiness](./schedule-engine-v3-production-readiness.md)
- [Benchmark](./schedule-engine-v3-benchmark.md)
- [Migration](./schedule-engine-v3-migration.md)
