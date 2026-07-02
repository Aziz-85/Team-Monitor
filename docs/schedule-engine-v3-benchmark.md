# Schedule Engine v3 — Production Benchmark

Generated: 2026-07-02T13:53:53.227Z

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
| Load grid | 56.2 |
| Load fairness context | 1.3 |
| Load guest shifts | 5.4 |
| Build operating periods | 0.0 |
| Build input (total) | 0.1 |

## Primary run (run 1)

| Metric | Value | Acceptance |
|--------|-------|------------|
| **Total solve time** | **29.3 ms** | PASS (< 3000 ms) |
| **Solve constraints** | **23.5 ms** | PASS (< 2500 ms) |
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
| Avg total solve | 24.0 ms |
| Avg solve constraints | 21.5 ms |
| Max constraint iterations | 153 |
| Heap before (load) | 366.04 MB |
| Heap after (5 runs) | 378.34 MB |
| Heap growth | 12.3 MB |

### Per-run detail

| Run | Total ms | Solve ms | Iterations | Status | Violations | Coverage | Heap MB |
|-----|----------|----------|------------|--------|------------|----------|---------|
| 1 | 29.3 | 23.5 | 153 | IMPOSSIBLE | 119 | false | 377.62 |
| 2 | 23.4 | 21.8 | 153 | IMPOSSIBLE | 119 | false | 366.25 |
| 3 | 22.5 | 20.9 | 153 | IMPOSSIBLE | 119 | false | 370.51 |
| 4 | 22.5 | 20.8 | 153 | IMPOSSIBLE | 119 | false | 374.43 |
| 5 | 22.3 | 20.3 | 153 | IMPOSSIBLE | 119 | false | 378.34 |

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| Total solve < 3000 ms (avg) | **PASS** (24.0 ms) |
| Solve constraints < 2500 ms (avg) | **PASS** (21.5 ms) |
| Constraint iterations ≤ 5000 (max) | **PASS** (153) |
| Solver status COMPLETE or IMPOSSIBLE | **PASS** |
| No timeout (PARTIAL_TIMEOUT) | **PASS** |
| No infinite loop (iterations bounded) | **PASS** |
| Memory stable (heap growth < 50 MB) | **PASS** (12.3 MB) |

## Overall

**✅ ALL ACCEPTANCE CRITERIA PASSED**

## Pre-optimization comparison (production logs)

Same boutique profile (4 regular employees, 7 days, ~168 time slots) before solver caps:

| Metric | Before | After (run 1) | Improvement |
|--------|--------|---------------|-------------|
| Total solve | ~182,495 ms | 29.3 ms | **~6,228× faster** |
| Constraint iterations | 398,527 | 153 | **~2,605× fewer** |
| Weekly-off variants tried | 24 (6 scenarios) | 5 | Capped + early exit |
| Gateway timeout (504) | Yes (~60s nginx) | No | Eliminated |

The solver now returns `IMPOSSIBLE` with `slotViolations` when coverage cannot be satisfied (stopped reason: `NO_PROGRESS`), instead of looping until timeout.

---

*Script: `scripts/benchmark-schedule-engine-v3.ts`*
