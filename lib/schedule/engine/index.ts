/**
 * Schedule Engine v3 — SINGLE SOURCE OF TRUTH facade.
 *
 * Pipeline (nothing outside this boundary may calculate coverage):
 *
 *   Schedule Engine      lib/schedule/generateSchedule/engine.ts   (generateSchedule)
 *        ↓
 *   Validation Engine    lib/schedule/generateSchedule/timeSlots.ts (validateCoverage — 30-min slots)
 *                        lib/schedule/timeCoverageValidation.ts     (validateTimeCoverageForGrid)
 *        ↓
 *   Coverage Engine      lib/schedule/segmentCoverage.ts            (AM/PM derived from segments)
 *        ↓
 *   Fairness Engine      lib/schedule/generateSchedule/fairness.ts
 *        ↓
 *   Persistence          lib/schedule/shiftOverrideSegments.ts      (ShiftOverrideSegment rows)
 *                        lib/services/scheduleApply.ts
 *        ↓
 *   Grid (renderer)      lib/services/scheduleGrid.ts               (loads segments, exposes engine output)
 *        ↓
 *   Audit                reads validation output — never recomputes
 *
 * Rules:
 * - Operating periods come from configuration only (operatingPeriods.ts). No hardcoded Friday/Ramadan logic
 *   anywhere else.
 * - Coverage is counted on 30-minute slots from saved segments. AM/PM buckets are a *projection* of segments
 *   (segmentCoverage.ts), never an independent calculation.
 * - Split shifts are two (or more) segments. Segments are persisted on apply and never reconstructed when
 *   saved segments exist.
 * - External support employees count like regular employees once present in the pool.
 * - Apply is gated on CoverageValid == true (slot violations are returned to the UI otherwise).
 */

// Configuration layer
export {
  operatingPeriodsForDay,
  buildWeekOperatingConfigs,
  weekModeFromDays,
  FRIDAY_DOW,
} from '@/lib/schedule/generateSchedule/operatingPeriods';

// Types
export type {
  OperatingPeriod,
  DayOperatingConfig,
  TimeSlot,
  ShiftSegment,
  SlotViolation,
  DaySlotBundle,
  WorkingDayShift,
  EmployeeCandidate,
  EmployeeDayAssignment,
  GenerateScheduleInput,
  GenerateScheduleResult,
  GridShiftProposal,
  EmployeeWeekSummary,
} from '@/lib/schedule/generateSchedule/types';

// Slot / validation layer
export {
  buildTimeSlots,
  buildDaySlotBundles,
  calculateCoverageForSlot,
  validateCoverage as validateSlotCoverage,
  parseTimeToMinutes,
  formatMinutesAsTime,
  periodBounds,
  dayTotalHours,
  mergeAdjacentSegments,
} from '@/lib/schedule/generateSchedule/timeSlots';
export {
  validateTimeCoverageForGrid,
  formatSlotViolationMessage,
  groupSlotViolationsByDate,
  type TimeCoverageResult,
} from '@/lib/schedule/timeCoverageValidation';

// Coverage projection layer (AM/PM buckets derived from segments)
export {
  segmentsAmPmContribution,
  shiftAmPmContribution,
  shiftToSegmentsForCounting,
  segmentsToGridShiftEnum,
  incrementCountsFromShiftCoverage,
  type AmPmContribution,
} from '@/lib/schedule/segmentCoverage';

// Fairness layer
export {
  calculateFairnessScore,
  buildEmployeeSummaries,
  countEmployeeWeeklySplitDays,
} from '@/lib/schedule/generateSchedule/fairness';

// Performance instrumentation (v3 diagnostics)
export {
  ScheduleEnginePerfCollector,
  isSchedulePerfResponseEnabled,
  shouldLogSchedulePerf,
  logScheduleEnginePerf,
} from '@/lib/schedule/scheduleEnginePerf';
export type {
  ScheduleEnginePerfSnapshot,
  ScheduleEngineStageTimings,
  ScheduleEnginePerfStats,
} from '@/lib/schedule/scheduleEnginePerf';
// Generation layer
export { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
export type { GenerateScheduleOptions } from '@/lib/schedule/generateSchedule/engine';
export { buildGenerateScheduleInput } from '@/lib/schedule/generateSchedule/buildInput';
export { loadGenerateScheduleInputForWeek } from '@/lib/schedule/loadScheduleEngineInput';
export {
  analyzeScheduleConstraints,
  mainConstraintReason,
  topConstraintRecommendation,
} from '@/lib/schedule/constraintAnalyzer';
export type {
  ConstraintAnalysisResult,
  ConstraintAnalysisStatus,
  ConstraintIssue,
  ConstraintRecommendation,
  ConstraintAnalysisSummary,
} from '@/lib/schedule/constraintAnalyzer';
export {
  computeScheduleHealthKpis,
  impossibleDaysFromAnalysis,
} from '@/lib/schedule/scheduleHealthKpis';
export type { ScheduleHealthKpis, HealthLevel } from '@/lib/schedule/scheduleHealthKpis';
export {
  qualityPercentsFromAnalysis,
  qualityPercentsFromSolve,
  fairnessHealthFromRawScore,
} from '@/lib/schedule/scheduleQuality';
export type { ScheduleQualityPercents } from '@/lib/schedule/scheduleQuality';
export {
  getSchedulePolicy,
  generateSettingsFromPolicy,
  getDefaultGenerateSettings,
  operatingPeriodsForPolicy,
  FRIDAY_DOW as POLICY_FRIDAY_DOW,
} from '@/lib/schedule/policyEngine';
export type { SchedulePolicy, SchedulePolicyMode, FridayMode } from '@/lib/schedule/policyEngine';
export {
  generateSmartRecommendations,
  topSmartRecommendations,
} from '@/lib/schedule/recommendationEngine';
export type {
  SmartRecommendation,
  SmartRecommendationType,
  RecommendationEngineInput,
  AffectedTimeRange,
} from '@/lib/schedule/recommendationEngine';
export { planWeeklyResources } from '@/lib/schedule/resourcePlanner';
export type {
  WorkforcePlan,
  EmployeeResource,
  DailyWorkload,
  WorkforceBudget,
  EmployeePlan,
  BridgeAssignment,
  OvertimeAssignment,
  CompensationLedgerEntry,
  PlannerRecommendation,
  ShiftAllocationType,
} from '@/lib/schedule/resourcePlanner';
export { simulateScheduleScenarios } from '@/lib/schedule/scenarioSimulator';
export type {
  ScenarioType,
  ScenarioAction,
  ScenarioSimulationResult,
  SimulatedScenario,
  ScenarioSimulationSummary,
  ScenarioSimulationOptions,
  ScenarioSimulationOutput,
  ScenarioSimulationPerformance,
  ScenarioPreviewAssignment,
} from '@/lib/schedule/scenarioSimulator';
export { scoreScenario, rankScenarioScores, SCENARIO_SCORE_WEIGHTS } from '@/lib/schedule/scenarioScoring';
export type { ScenarioScoreBreakdown, ScenarioScoreInput } from '@/lib/schedule/scenarioScoring';
export { generateResultToPlanActions } from '@/lib/schedule/generateSchedule/toPlanActions';
export { buildSchedulePlanFromGenerate } from '@/lib/schedule/generateSchedule/planBridge';

// Persistence layer
export {
  replaceOverrideSegments,
  loadSegmentsByOverrideIds,
  type StoredShiftSegment,
} from '@/lib/schedule/shiftOverrideSegments';
