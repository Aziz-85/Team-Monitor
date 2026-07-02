# Schedule Engine v3 — Production Benchmark

Generated: 2026-07-02T14:32:48.330Z

## Environment

| Setting | Value |
|---------|-------|
| Week start | `2026-03-07` |
| Boutique IDs | `bout_rashid_001` |
| Benchmark runs | 5 |
| Solver caps | MAX_SCENARIOS=8, MAX_ITERATIONS_PER_DAY=300, MAX_TOTAL_ITERATIONS=5000, MAX_SOLVE_MS=2500 |

## Input (real Schedule Solver pipeline)

Loaded via `getScheduleGridForWeek` → `buildGenerateScheduleInput` (same as `POST /api/schedule/v3/solve`).

| Metric | Value |
|--------|-------|
| Regular employees | 4 |
| External support | 2 |
| Days | 7 |
| Guest shifts | 2 |
| Unavailability entries | 2 |
| Time slots (run 1) | 168 |
| Weekly-off variants (run 1) | 5 |
| Grid rows | 4 |

### Input load timings (ms)

| Stage | ms |
|-------|-----|
| Load grid | 58.7 |
| Load fairness context | 3.9 |
| Load guest shifts | 4.9 |
| Build operating periods | 0.0 |
| Build input (total) | 0.2 |

## Primary run (run 1)

| Metric | Value | Acceptance |
|--------|-------|------------|
| **Total solve time** | **30.7 ms** | PASS (< 3000 ms) |
| **Solve constraints** | **27.2 ms** | PASS (< 2500 ms) |
| **Constraint iterations** | **153** | PASS (≤ 5000) |
| **Solver status** | **IMPOSSIBLE** | PASS |
| Stopped reason | NO_PROGRESS | — |
| **Slot violations** | **119** | — |
| **Fairness score** | **120771.3** | — |
| **Coverage valid** | **false** | — |
| Scenarios tried | 5 | — |

## Stability (5 consecutive solves)

| Metric | Value |
|--------|-------|
| Avg total solve | 24.5 ms |
| Avg solve constraints | 22.4 ms |
| Max constraint iterations | 153 |
| Heap before (load) | 368.24 MB |
| Heap after (5 runs) | 365.63 MB |
| Heap growth | -2.61 MB |

### Per-run detail

| Run | Total ms | Solve ms | Iterations | Status | Violations | Coverage | Heap MB |
|-----|----------|----------|------------|--------|------------|----------|---------|
| 1 | 30.7 | 27.2 | 153 | IMPOSSIBLE | 119 | false | 364.87 |
| 2 | 23.2 | 21.5 | 153 | IMPOSSIBLE | 119 | false | 369.15 |
| 3 | 22.6 | 21 | 153 | IMPOSSIBLE | 119 | false | 373.22 |
| 4 | 22.6 | 20.8 | 153 | IMPOSSIBLE | 119 | false | 377.49 |
| 5 | 23.2 | 21.5 | 153 | IMPOSSIBLE | 119 | false | 365.63 |

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| Total solve < 3000 ms (avg) | **PASS** (24.5 ms) |
| Solve constraints < 2500 ms (avg) | **PASS** (22.4 ms) |
| Constraint iterations ≤ 5000 (max) | **PASS** (153) |
| Solver status COMPLETE or IMPOSSIBLE | **PASS** |
| No timeout (PARTIAL_TIMEOUT) | **PASS** |
| No infinite loop (iterations bounded) | **PASS** |
| Memory stable (heap growth < 50 MB) | **PASS** (-2.61 MB) |

## Overall

**✅ ALL ACCEPTANCE CRITERIA PASSED**

---

*Script: `scripts/benchmark-schedule-engine-v3.ts`*
