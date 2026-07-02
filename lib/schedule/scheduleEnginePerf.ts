/**
 * Schedule Engine v3 — performance instrumentation (measure only, no optimization).
 */

export type ScheduleEngineStageTimings = {
  /** DB reads: grid, fairness context, guest shifts */
  persistenceMs: number;
  loadGridMs: number;
  loadFairnessContextMs: number;
  loadGuestShiftsMs: number;
  buildInputMs: number;
  buildOperatingPeriodsMs: number;
  buildTimeSlotsMs: number;
  generateCandidatesMs: number;
  solveConstraintsMs: number;
  coverageValidationMs: number;
  fairnessMs: number;
  planActionsMs: number;
  responseSerializationMs: number;
  generateScheduleMs: number;
  totalMs: number;
};

export type ScheduleEnginePerfStats = {
  employeeCount: number;
  externalSupportCount: number;
  dayCount: number;
  assignmentCount: number;
  scenariosTried: number;
  weeklyOffVariants: number;
  timeSlotsGenerated: number;
  constraintIterations: number;
  slotViolations: number;
  planActionCount: number;
  solverStatus: string | null;
  stoppedReason: string | null;
  iterationsByDay: Record<string, number>;
  iterationsByScenario: number[];
};

export type ScheduleEnginePerfSnapshot = {
  timings: ScheduleEngineStageTimings;
  stats: ScheduleEnginePerfStats;
};

const STAGE_LABELS: Array<[keyof ScheduleEngineStageTimings, string]> = [
  ['persistenceMs', 'Persistence'],
  ['loadGridMs', '  Load grid'],
  ['loadFairnessContextMs', '  Load fairness context'],
  ['loadGuestShiftsMs', '  Load guest shifts'],
  ['buildInputMs', 'Build input'],
  ['buildOperatingPeriodsMs', 'Build operating periods'],
  ['buildTimeSlotsMs', 'Build time slots'],
  ['generateCandidatesMs', 'Generate candidates'],
  ['solveConstraintsMs', 'Solve constraints'],
  ['coverageValidationMs', 'Coverage validation'],
  ['fairnessMs', 'Fairness'],
  ['planActionsMs', 'Plan actions'],
  ['responseSerializationMs', 'Response serialization'],
  ['generateScheduleMs', 'Generate schedule (total)'],
  ['totalMs', 'Total'],
];

function emptyTimings(): ScheduleEngineStageTimings {
  return {
    persistenceMs: 0,
    loadGridMs: 0,
    loadFairnessContextMs: 0,
    loadGuestShiftsMs: 0,
    buildInputMs: 0,
    buildOperatingPeriodsMs: 0,
    buildTimeSlotsMs: 0,
    generateCandidatesMs: 0,
    solveConstraintsMs: 0,
    coverageValidationMs: 0,
    fairnessMs: 0,
    planActionsMs: 0,
    responseSerializationMs: 0,
    generateScheduleMs: 0,
    totalMs: 0,
  };
}

function emptyStats(): ScheduleEnginePerfStats {
  return {
    employeeCount: 0,
    externalSupportCount: 0,
    dayCount: 0,
    assignmentCount: 0,
    scenariosTried: 0,
    weeklyOffVariants: 0,
    timeSlotsGenerated: 0,
    constraintIterations: 0,
    slotViolations: 0,
    planActionCount: 0,
    solverStatus: null,
    stoppedReason: null,
    iterationsByDay: {},
    iterationsByScenario: [],
  };
}

export function isSchedulePerfResponseEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.SCHEDULE_ENGINE_PERF === '1';
}

export function shouldLogSchedulePerf(): boolean {
  return process.env.NODE_ENV !== 'test';
}

export class ScheduleEnginePerfCollector {
  readonly timings = emptyTimings();
  readonly stats = emptyStats();
  private readonly startedAt = performance.now();

  mark(stage: keyof ScheduleEngineStageTimings, ms: number): void {
    this.timings[stage] = (this.timings[stage] ?? 0) + ms;
  }

  setStat<K extends keyof ScheduleEnginePerfStats>(key: K, value: ScheduleEnginePerfStats[K]): void {
    this.stats[key] = value;
  }

  addStat(key: 'constraintIterations', delta: number): void {
    this.stats.constraintIterations += delta;
  }

  async timeAsync<T>(stage: keyof ScheduleEngineStageTimings, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.mark(stage, performance.now() - t0);
    }
  }

  timeSync<T>(stage: keyof ScheduleEngineStageTimings, fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.mark(stage, performance.now() - t0);
    }
  }

  finalize(): ScheduleEnginePerfSnapshot {
    this.timings.totalMs = performance.now() - this.startedAt;
    this.timings.persistenceMs =
      this.timings.loadGridMs + this.timings.loadFairnessContextMs + this.timings.loadGuestShiftsMs;
    return this.snapshot();
  }

  snapshot(): ScheduleEnginePerfSnapshot {
    return {
      timings: { ...this.timings },
      stats: { ...this.stats },
    };
  }

  formatLogLines(): string[] {
    const snap = this.finalize();
    const lines = ['Schedule Engine v3 — performance', '─'.repeat(40)];
    for (const [key, label] of STAGE_LABELS) {
      if (key === 'persistenceMs' || key === 'totalMs' || key === 'generateScheduleMs') {
        lines.push(`${label.padEnd(28, '.')} ${snap.timings[key].toFixed(1)} ms`);
      } else if (key.startsWith('load')) {
        lines.push(`${label.padEnd(28, '.')} ${snap.timings[key].toFixed(1)} ms`);
      } else {
        lines.push(`${label.padEnd(28, '.')} ${snap.timings[key].toFixed(1)} ms`);
      }
    }
    lines.push('─'.repeat(40));
    lines.push(`Employees ................. ${snap.stats.employeeCount}`);
    lines.push(`External support .......... ${snap.stats.externalSupportCount}`);
    lines.push(`Days ...................... ${snap.stats.dayCount}`);
    lines.push(`Assignments generated ..... ${snap.stats.assignmentCount}`);
    lines.push(`Scenarios tried ........... ${snap.stats.scenariosTried}`);
    lines.push(`Weekly-off variants ....... ${snap.stats.weeklyOffVariants}`);
    lines.push(`Time slots generated ...... ${snap.stats.timeSlotsGenerated}`);
    lines.push(`Constraint iterations ..... ${snap.stats.constraintIterations}`);
    lines.push(`Slot violations ........... ${snap.stats.slotViolations}`);
    lines.push(`Plan actions .............. ${snap.stats.planActionCount}`);
    if (snap.stats.solverStatus) {
      lines.push(`Solver status ............. ${snap.stats.solverStatus}`);
    }
    if (snap.stats.stoppedReason) {
      lines.push(`Stopped reason ............ ${snap.stats.stoppedReason}`);
    }
    const dayIterKeys = Object.keys(snap.stats.iterationsByDay);
    if (dayIterKeys.length) {
      lines.push(
        `Iterations by day ......... ${dayIterKeys.map((d) => `${d}:${snap.stats.iterationsByDay[d]}`).join(', ')}`
      );
    }
    if (snap.stats.iterationsByScenario.length) {
      lines.push(`Iterations by scenario .... ${snap.stats.iterationsByScenario.join(', ')}`);
    }
    return lines;
  }

  log(prefix = '[schedule-engine-perf]'): void {
    if (!shouldLogSchedulePerf()) return;
    for (const line of this.formatLogLines()) {
      console.log(`${prefix} ${line}`);
    }
  }
}

export function logScheduleEnginePerf(snapshot: ScheduleEnginePerfSnapshot, prefix = '[schedule-engine-perf]'): void {
  if (!shouldLogSchedulePerf()) return;
  const collector = new ScheduleEnginePerfCollector();
  Object.assign(collector.timings, snapshot.timings);
  Object.assign(collector.stats, snapshot.stats);
  collector.log(prefix);
}
