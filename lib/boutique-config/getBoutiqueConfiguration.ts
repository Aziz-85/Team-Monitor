import { prisma } from '@/lib/db';
import {
  DEFAULT_BOUTIQUE_CONFIGURATION,
  DEFAULT_SHIFT_TEMPLATES,
  FRIDAY_DAY_OF_WEEK,
  defaultCoveragePolicy,
} from './defaults';
import type {
  BoutiqueConfigurationValues,
  CoveragePolicyValues,
  ExternalSupportPriority,
  OperatingHours,
  PlanningStrategy,
  ResolvedBoutiqueConfiguration,
  ShiftTemplateType,
  ShiftTemplateValues,
  SpecialPeriodType,
  SpecialPeriodValues,
  WeeklyOffPolicy,
} from './types';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapConfig(row: {
  timezone: string;
  normalOpenTime: string;
  normalCloseTime: string;
  fridayOpenTime: string;
  fridayCloseTime: string;
  weeklyOffPolicy: string;
  preferredWeeklyOffRecoveryDay: string;
  allowWeeklyOffDeferral: boolean;
  maxDeferredWeeklyOffPerWeek: number;
  allowExternalSupport: boolean;
  externalSupportPriority: string;
  allowOvertime: boolean;
  maxOvertimeHoursPerEmployeePerDay: number;
  allowBridgeShift: boolean;
  maxBridgeDaysPerEmployeePerWeek: number;
  planningStrategy: string;
}): BoutiqueConfigurationValues {
  return {
    timezone: row.timezone,
    normalOpenTime: row.normalOpenTime,
    normalCloseTime: row.normalCloseTime,
    fridayOpenTime: row.fridayOpenTime,
    fridayCloseTime: row.fridayCloseTime,
    weeklyOffPolicy: row.weeklyOffPolicy as WeeklyOffPolicy,
    preferredWeeklyOffRecoveryDay: row.preferredWeeklyOffRecoveryDay,
    allowWeeklyOffDeferral: row.allowWeeklyOffDeferral,
    maxDeferredWeeklyOffPerWeek: row.maxDeferredWeeklyOffPerWeek,
    allowExternalSupport: row.allowExternalSupport,
    externalSupportPriority: row.externalSupportPriority as ExternalSupportPriority,
    allowOvertime: row.allowOvertime,
    maxOvertimeHoursPerEmployeePerDay: row.maxOvertimeHoursPerEmployeePerDay,
    allowBridgeShift: row.allowBridgeShift,
    maxBridgeDaysPerEmployeePerWeek: row.maxBridgeDaysPerEmployeePerWeek,
    planningStrategy: row.planningStrategy as PlanningStrategy,
  };
}

/**
 * Resolve the effective boutique configuration for a given date.
 *
 * Rules:
 * - If the date falls inside an active special operating period, use its operating hours.
 * - Otherwise use Friday hours on Friday, else normal hours.
 * - If no configuration row exists, fall back to safe defaults (never throws).
 *
 * This is a read-only service. It does not alter CoverageRule or any existing consumer.
 */
export async function getBoutiqueConfiguration(
  boutiqueId: string,
  date?: Date
): Promise<ResolvedBoutiqueConfiguration> {
  const when = date ?? new Date();

  const [configRow, templateRows, policyRows, periodRows] = await Promise.all([
    prisma.boutiqueConfiguration.findUnique({ where: { boutiqueId } }),
    prisma.boutiqueShiftTemplate.findMany({
      where: { boutiqueId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.boutiqueCoveragePolicy.findMany({
      where: { boutiqueId },
      orderBy: { dayOfWeek: 'asc' },
    }),
    prisma.boutiqueSpecialOperatingPeriod.findMany({
      where: {
        boutiqueId,
        isActive: true,
        startDate: { lte: when },
        endDate: { gte: when },
      },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  const usingDefaults = !configRow;
  const config = configRow ? mapConfig(configRow) : { ...DEFAULT_BOUTIQUE_CONFIGURATION };

  const shiftTemplates: ShiftTemplateValues[] = templateRows.length
    ? templateRows.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        type: t.type as ShiftTemplateType,
        startTime: t.startTime,
        endTime: t.endTime,
        secondStartTime: t.secondStartTime,
        secondEndTime: t.secondEndTime,
        isDefault: t.isDefault,
        isActive: t.isActive,
        sortOrder: t.sortOrder,
      }))
    : DEFAULT_SHIFT_TEMPLATES.map((t) => ({ ...t }));

  const coveragePolicy: CoveragePolicyValues[] = policyRows.length
    ? policyRows.map((p) => ({
        id: p.id,
        dayOfWeek: p.dayOfWeek,
        minMorning: p.minMorning,
        minEvening: p.minEvening,
        minTotal: p.minTotal,
        isFridayOverride: p.isFridayOverride,
        isActive: p.isActive,
      }))
    : defaultCoveragePolicy();

  const activePeriodRow = periodRows[0] ?? null;
  const activeSpecialPeriod: SpecialPeriodValues | null = activePeriodRow
    ? {
        id: activePeriodRow.id,
        name: activePeriodRow.name,
        type: activePeriodRow.type as SpecialPeriodType,
        startDate: isoDate(activePeriodRow.startDate),
        endDate: isoDate(activePeriodRow.endDate),
        openTime: activePeriodRow.openTime,
        closeTime: activePeriodRow.closeTime,
        secondOpenTime: activePeriodRow.secondOpenTime,
        secondCloseTime: activePeriodRow.secondCloseTime,
        minMorningCoverage: activePeriodRow.minMorningCoverage,
        minEveningCoverage: activePeriodRow.minEveningCoverage,
        minTotalCoverage: activePeriodRow.minTotalCoverage,
        suspendWeeklyOff: activePeriodRow.suspendWeeklyOff,
        allowExternalSupport: activePeriodRow.allowExternalSupport,
        notes: activePeriodRow.notes,
        isActive: activePeriodRow.isActive,
      }
    : null;

  const isFriday = when.getDay() === FRIDAY_DAY_OF_WEEK;
  let operatingHours: OperatingHours;
  if (activeSpecialPeriod) {
    operatingHours = {
      openTime: activeSpecialPeriod.openTime,
      closeTime: activeSpecialPeriod.closeTime,
      secondOpenTime: activeSpecialPeriod.secondOpenTime,
      secondCloseTime: activeSpecialPeriod.secondCloseTime,
      source: 'SPECIAL_PERIOD',
    };
  } else if (isFriday) {
    operatingHours = {
      openTime: config.fridayOpenTime,
      closeTime: config.fridayCloseTime,
      secondOpenTime: null,
      secondCloseTime: null,
      source: 'FRIDAY',
    };
  } else {
    operatingHours = {
      openTime: config.normalOpenTime,
      closeTime: config.normalCloseTime,
      secondOpenTime: null,
      secondCloseTime: null,
      source: 'NORMAL',
    };
  }

  return {
    boutiqueId,
    config,
    activeSpecialPeriod,
    operatingHours,
    shiftTemplates,
    coveragePolicy,
    weeklyOffPolicy: {
      policy: config.weeklyOffPolicy,
      preferredRecoveryDay: config.preferredWeeklyOffRecoveryDay,
      allowDeferral: config.allowWeeklyOffDeferral,
      maxDeferredPerWeek: config.maxDeferredWeeklyOffPerWeek,
    },
    externalSupportPolicy: {
      allow: config.allowExternalSupport,
      priority: config.externalSupportPriority,
    },
    overtimePolicy: {
      allow: config.allowOvertime,
      maxHoursPerEmployeePerDay: config.maxOvertimeHoursPerEmployeePerDay,
    },
    planningStrategy: config.planningStrategy,
    usingDefaults,
  };
}
