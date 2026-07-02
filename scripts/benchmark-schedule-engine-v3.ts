/**
 * Production-style Schedule Engine v3 benchmark.
 *
 * Mirrors POST /api/schedule/v3/solve input pipeline (grid → buildInput → generateSchedule).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register \
 *     --compiler-options '{"module":"CommonJS"}' \
 *     scripts/benchmark-schedule-engine-v3.ts
 *
 * Optional env:
 *   BENCHMARK_WEEK_START=2026-03-07
 *   BENCHMARK_BOUTIQUE_IDS=bout_rashid_001
 *   BENCHMARK_RUNS=5
 *   BENCHMARK_REPORT=docs/schedule-engine-v3-benchmark.md
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext, buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import { loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from '@/lib/schedule/generateSchedule/buildInput';
import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { ScheduleEnginePerfCollector } from '@/lib/schedule/scheduleEnginePerf';
import {
  MAX_ITERATIONS_PER_DAY,
  MAX_SCENARIOS,
  MAX_SOLVE_MS,
  MAX_TOTAL_ITERATIONS,
} from '@/lib/schedule/generateSchedule/solverLimits';

type RunResult = {
  run: number;
  totalMs: number;
  solveConstraintsMs: number;
  constraintIterations: number;
  solverStatus: string;
  stoppedReason: string | null;
  slotViolations: number;
  fairnessScore: number;
  coverageValid: boolean;
  scenariosTried: number;
  weeklyOffVariants: number;
  timeSlotsGenerated: number;
  heapUsedMb: number;
};

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function formatAcceptance(passed: boolean): string {
  return passed ? 'PASS' : 'FAIL';
}

async function loadProductionInput(weekStart: string, boutiqueIds: string[]) {
  const perf = new ScheduleEnginePerfCollector();
  const grid = await perf.timeAsync('loadGridMs', () =>
    getScheduleGridForWeek(weekStart, { boutiqueIds })
  );
  const empIds = grid.rows.filter((r) => !r.isGuest).map((r) => r.empId);
  const ramadanRange = getRamadanRange();

  const [fairnessContext, guestShifts] = await Promise.all([
    perf.timeAsync('loadFairnessContextMs', () => loadFairnessContext(weekStart, empIds)),
    perf.timeAsync('loadGuestShiftsMs', () => loadWeekGuestShifts(weekStart, boutiqueIds)),
  ]);
  const fairnessRows = buildEmployeeFairness(grid.rows, fairnessContext);
  const input = buildGenerateScheduleInput(grid, {
    guestShifts,
    fairnessRows,
    ramadanRange,
    perf,
  });

  return { grid, input, guestShifts, perfLoadMs: perf.finalize().timings };
}

async function runBenchmark() {
  const weekStart = process.env.BENCHMARK_WEEK_START ?? '2026-03-07';
  const boutiqueIds = (process.env.BENCHMARK_BOUTIQUE_IDS ?? 'bout_rashid_001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const runs = Number(process.env.BENCHMARK_RUNS ?? '5');
  const reportPath = resolve(
    process.cwd(),
    process.env.BENCHMARK_REPORT ?? 'docs/schedule-engine-v3-benchmark.md'
  );

  const heapBefore = process.memoryUsage().heapUsed;
  const { grid, input, guestShifts, perfLoadMs } = await loadProductionInput(weekStart, boutiqueIds);

  const inputSummary = {
    weekStart,
    boutiqueIds,
    regularEmployees: input.regularEmployees.length,
    externalSupportEmployees: input.externalSupportEmployees.length,
    days: input.days.length,
    guestShifts: guestShifts.length,
    unavailabilityEntries: input.unavailability.length,
  };

  const results: RunResult[] = [];

  for (let i = 1; i <= runs; i++) {
    if (global.gc) global.gc();
    const perf = new ScheduleEnginePerfCollector();
    const t0 = performance.now();
    const result = generateSchedule(input, { perf });
    const totalMs = performance.now() - t0;
    const snap = perf.finalize();

    results.push({
      run: i,
      totalMs: Math.round(totalMs * 10) / 10,
      solveConstraintsMs: Math.round(snap.timings.solveConstraintsMs * 10) / 10,
      constraintIterations: snap.stats.constraintIterations,
      solverStatus: result.solverStatus,
      stoppedReason: result.stoppedReason,
      slotViolations: result.slotViolations.length,
      fairnessScore: Math.round(result.fairnessScore * 10) / 10,
      coverageValid: result.coverageValid,
      scenariosTried: result.scenariosTried,
      weeklyOffVariants: snap.stats.weeklyOffVariants,
      timeSlotsGenerated: snap.stats.timeSlotsGenerated,
      heapUsedMb: mb(process.memoryUsage().heapUsed),
    });
  }

  const heapAfter = process.memoryUsage().heapUsed;
  const primary = results[0];
  const avgTotalMs = results.reduce((s, r) => s + r.totalMs, 0) / results.length;
  const avgSolveMs = results.reduce((s, r) => s + r.solveConstraintsMs, 0) / results.length;
  const maxIterations = Math.max(...results.map((r) => r.constraintIterations));
  const heapGrowthMb = mb(heapAfter - heapBefore);

  const acceptance = {
    totalSolveUnder3000: avgTotalMs < 3000,
    solveConstraintsUnder2500: avgSolveMs < MAX_SOLVE_MS,
    iterationsUnder5000: maxIterations <= MAX_TOTAL_ITERATIONS,
    statusCompleteOrImpossible: results.every((r) =>
      ['COMPLETE', 'IMPOSSIBLE'].includes(r.solverStatus)
    ),
    noTimeout: results.every((r) => r.solverStatus !== 'PARTIAL_TIMEOUT'),
    noInfiniteLoop: results.every((r) => r.constraintIterations <= MAX_TOTAL_ITERATIONS),
    memoryStable: heapGrowthMb < 50,
  };

  const allPassed = Object.values(acceptance).every(Boolean);
  const timestamp = new Date().toISOString();

  const report = `# Schedule Engine v3 — Production Benchmark

Generated: ${timestamp}

## Environment

| Setting | Value |
|---------|-------|
| Week start | \`${weekStart}\` |
| Boutique IDs | \`${boutiqueIds.join(', ')}\` |
| Benchmark runs | ${runs} |
| Solver caps | MAX_SCENARIOS=${MAX_SCENARIOS}, MAX_ITERATIONS_PER_DAY=${MAX_ITERATIONS_PER_DAY}, MAX_TOTAL_ITERATIONS=${MAX_TOTAL_ITERATIONS}, MAX_SOLVE_MS=${MAX_SOLVE_MS} |

## Input (real Schedule Solver pipeline)

Loaded via \`getScheduleGridForWeek\` → \`buildGenerateScheduleInput\` (same as \`POST /api/schedule/v3/solve\`).

| Metric | Value |
|--------|-------|
| Regular employees | ${inputSummary.regularEmployees} |
| External support | ${inputSummary.externalSupportEmployees} |
| Days | ${inputSummary.days} |
| Guest shifts | ${inputSummary.guestShifts} |
| Unavailability entries | ${inputSummary.unavailabilityEntries} |
| Time slots (run 1) | ${primary.timeSlotsGenerated} |
| Weekly-off variants (run 1) | ${primary.weeklyOffVariants} |
| Grid rows | ${grid.rows.length} |

### Input load timings (ms)

| Stage | ms |
|-------|-----|
| Load grid | ${perfLoadMs.loadGridMs.toFixed(1)} |
| Load fairness context | ${perfLoadMs.loadFairnessContextMs.toFixed(1)} |
| Load guest shifts | ${perfLoadMs.loadGuestShiftsMs.toFixed(1)} |
| Build operating periods | ${perfLoadMs.buildOperatingPeriodsMs.toFixed(1)} |
| Build input (total) | ${perfLoadMs.buildInputMs.toFixed(1)} |

## Primary run (run 1)

| Metric | Value | Acceptance |
|--------|-------|------------|
| **Total solve time** | **${primary.totalMs} ms** | ${formatAcceptance(primary.totalMs < 3000)} (< 3000 ms) |
| **Solve constraints** | **${primary.solveConstraintsMs} ms** | ${formatAcceptance(primary.solveConstraintsMs < MAX_SOLVE_MS)} (< ${MAX_SOLVE_MS} ms) |
| **Constraint iterations** | **${primary.constraintIterations}** | ${formatAcceptance(primary.constraintIterations <= MAX_TOTAL_ITERATIONS)} (≤ ${MAX_TOTAL_ITERATIONS}) |
| **Solver status** | **${primary.solverStatus}** | ${formatAcceptance(['COMPLETE', 'IMPOSSIBLE'].includes(primary.solverStatus))} |
| Stopped reason | ${primary.stoppedReason ?? '—'} | — |
| **Slot violations** | **${primary.slotViolations}** | — |
| **Fairness score** | **${primary.fairnessScore}** | — |
| **Coverage valid** | **${primary.coverageValid}** | — |
| Scenarios tried | ${primary.scenariosTried} | — |

## Stability (${runs} consecutive solves)

| Metric | Value |
|--------|-------|
| Avg total solve | ${avgTotalMs.toFixed(1)} ms |
| Avg solve constraints | ${avgSolveMs.toFixed(1)} ms |
| Max constraint iterations | ${maxIterations} |
| Heap before (load) | ${mb(heapBefore)} MB |
| Heap after (${runs} runs) | ${mb(heapAfter)} MB |
| Heap growth | ${heapGrowthMb} MB |

### Per-run detail

| Run | Total ms | Solve ms | Iterations | Status | Violations | Coverage | Heap MB |
|-----|----------|----------|------------|--------|------------|----------|---------|
${results
  .map(
    (r) =>
      `| ${r.run} | ${r.totalMs} | ${r.solveConstraintsMs} | ${r.constraintIterations} | ${r.solverStatus} | ${r.slotViolations} | ${r.coverageValid} | ${r.heapUsedMb} |`
  )
  .join('\n')}

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| Total solve < 3000 ms (avg) | **${formatAcceptance(acceptance.totalSolveUnder3000)}** (${avgTotalMs.toFixed(1)} ms) |
| Solve constraints < 2500 ms (avg) | **${formatAcceptance(acceptance.solveConstraintsUnder2500)}** (${avgSolveMs.toFixed(1)} ms) |
| Constraint iterations ≤ 5000 (max) | **${formatAcceptance(acceptance.iterationsUnder5000)}** (${maxIterations}) |
| Solver status COMPLETE or IMPOSSIBLE | **${formatAcceptance(acceptance.statusCompleteOrImpossible)}** |
| No timeout (PARTIAL_TIMEOUT) | **${formatAcceptance(acceptance.noTimeout)}** |
| No infinite loop (iterations bounded) | **${formatAcceptance(acceptance.noInfiniteLoop)}** |
| Memory stable (heap growth < 50 MB) | **${formatAcceptance(acceptance.memoryStable)}** (${heapGrowthMb} MB) |

## Overall

**${allPassed ? '✅ ALL ACCEPTANCE CRITERIA PASSED' : '❌ SOME CRITERIA FAILED'}**

---

*Script: \`scripts/benchmark-schedule-engine-v3.ts\`*
`;

  writeFileSync(reportPath, report, 'utf8');

  console.log(JSON.stringify({ reportPath, inputSummary, primary, acceptance, allPassed, results }, null, 2));
  console.log(`\nReport written to ${reportPath}`);
}

runBenchmark().catch((e) => {
  console.error(e);
  process.exit(1);
});
