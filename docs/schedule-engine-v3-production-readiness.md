# Schedule Engine v3 — Production Readiness

**Date:** 2026-07-02  
**Branch:** `feature/schedule-engine-profiling`  
**Version label:** Schedule Engine 3.0 Stable (package `2.3.99` unchanged)

## Checklist summary

| Check | Result | Notes |
|-------|--------|-------|
| `npm run build` | **PASS** | Next.js production build completed |
| `npm test -- schedule` | **PASS** | 59 tests (9 suites) |
| `policyEngine` + `constraintAnalyzer` tests | **PASS** | 10 tests (2 suites) |
| Benchmark script | **PASS** | All acceptance criteria met |
| Policy Engine integrated | **PASS** | analyze, solve, buildInput, KPIs |
| Health Check workflow | **PASS** | Week change → analyze only; solve → analyze first |
| Management % metrics | **PASS** | Raw fairness in Technical Details only |
| Performance limits preserved | **PASS** | MAX_SCENARIOS=8, etc. |

## Benchmark results (production-style pipeline)

**Week:** `2026-03-07` · **Boutique:** `bout_rashid_001` · **Runs:** 5

| Metric | Primary run | Acceptance | Status |
|--------|-------------|------------|--------|
| Total solve | 30.7 ms | < 3000 ms | PASS |
| Solve constraints | 27.2 ms | < 2500 ms | PASS |
| Constraint iterations | 153 | ≤ 5000 | PASS |
| Solver status | `IMPOSSIBLE` | COMPLETE / NEEDS_SUPPORT / IMPOSSIBLE / PARTIAL_* | PASS |
| Stopped reason | `NO_PROGRESS` | No timeout | PASS |
| Scenarios tried | 5 | ≤ 8 | PASS |
| Infinite loop | — | None detected | PASS |

Median across 5 runs: ~23 ms total, ~21 ms solve constraints, 153 iterations.

Full report: [schedule-engine-v3-benchmark.md](./schedule-engine-v3-benchmark.md)

## Real-world scenario matrix

Scenarios validated via constraint analyzer unit tests and benchmark against live grid data.

### 1. Normal week (4 employees, no weekly off)

| Field | Value |
|-------|-------|
| Status | `FEASIBLE` |
| Policy mode | `normal` |
| Max daily hours | 8 |
| Missing staff hours | 0 |
| Critical issues | 0 |
| Top recommendation | — |

**Verdict:** Health check passes; solver auto-runs on Solve Schedule.

### 2. Week with leave (all employees on leave all week)

| Field | Value |
|-------|-------|
| Status | `IMPOSSIBLE` |
| Issue type | `LEAVE_OVERLOAD` |
| Recommendation | `ADJUST_LEAVE` (rank 6) |
| Insights | Leave is main blocker |

**Verdict:** Solver blocked; UI shows impossible gate with leave-focused guidance.

### 3. Impossible staffing week (1 employee, minCoverage 2)

| Field | Value |
|-------|-------|
| Status | `IMPOSSIBLE` |
| Issue type | `PEAK_COVERAGE_SHORTAGE` |
| Main reason | Peak minCoverage cannot be met |
| Insights | `whyImpossible` populated; external support / overtime flags set |

**Verdict:** Benchmark week (4 staff + 2 guests, Ramadan) also returns `IMPOSSIBLE` with 119 slot violations — staffing shortfall under current DB state.

### 4. Ramadan-style week

| Field | Value |
|-------|-------|
| Policy mode | `ramadan` |
| Max daily hours | 6 |
| Friday mode | `full_day` (AM + PM periods) |
| Operating periods | Dual blocks Sat–Thu and Fri |

**Verdict:** Policy engine correctly switches hours and Friday coverage; operating periods delegated from policy templates.

### 5. External support scenario (3 regular employees)

| Field | Value |
|-------|-------|
| Status | `NEEDS_SUPPORT` (missing hours > 0) |
| Top recommendation | `ADD_EXTERNAL_SUPPORT` (rank 1) |
| Benchmark guests | 2 external support employees loaded |

**Verdict:** Decision gate shown before solve; Continue anyway available.

## Workflow verification

| Step | Expected | Verified |
|------|----------|----------|
| Week change | Health check only, no solver | Yes — `ScheduleV3Client` preview analyze |
| Solve Schedule | Analyze first | Yes |
| FEASIBLE | Auto-solve | Yes |
| NEEDS_SUPPORT | Decision buttons | Yes |
| IMPOSSIBLE | Block + Run best possible | Yes — `forcePartialSolve` |
| Apply | Requires solver result + coverage gate | Yes — `schedulePlanApplyGate` tests |

## Known limitations

1. **DB migration gaps:** Local DB may lack `ShiftOverrideSegment` table and `SPLIT` enum — graceful fallbacks in place; production should run `npx prisma migrate deploy`.
2. **Analyzer vs solver:** Pre-solve capacity model is conservative; rare edge cases may differ from post-solve validation.
3. **Benchmark data:** Primary benchmark week is understaffed (`IMPOSSIBLE`) — reflects real boutique config, not synthetic ideal week.
4. **Policy overrides:** Boutique-specific policy DB storage not yet implemented; all boutiques share policy templates.
5. **Overtime:** Policy allows last-resort overtime; analyzer recommends but does not auto-enable.

## Recommended next steps before merge to main

1. QA on staging with migrated DB (SPLIT enum + segment table).
2. Manual UAT: FEASIBLE week, NEEDS_SUPPORT week, IMPOSSIBLE week, Apply with/without coverage.
3. Open PR from `feature/schedule-engine-profiling` → `main`.
4. Optional: bump package version to `3.0.0` at release cut (documented only for now).

## Related documentation

- [Stable architecture](./schedule-engine-v3-stable.md)
- [Policy engine](./schedule-policy-engine.md)
- [Benchmark](./schedule-engine-v3-benchmark.md)
