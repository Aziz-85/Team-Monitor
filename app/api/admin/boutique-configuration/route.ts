import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import { DEFAULT_BOUTIQUE_CONFIGURATION } from '@/lib/boutique-config/defaults';
import { backfillBoutiqueConfiguration } from '@/lib/boutique-config/backfill';
import {
  EXTERNAL_SUPPORT_PRIORITIES,
  PLANNING_STRATEGIES,
  SHIFT_TEMPLATE_TYPES,
  SPECIAL_PERIOD_TYPES,
  WEEKLY_OFF_POLICIES,
  isNonNegativeInt,
  isValidTime,
  isValidTimeRange,
  parseDateOnly,
  type ValidationError,
} from '@/lib/boutique-config/validation';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as Role[];

function authError(e: unknown): NextResponse {
  const err = e as { code?: string };
  if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

async function loadBoutiques() {
  return prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
}

async function loadConfigBundle(boutiqueId: string) {
  const [config, shiftTemplates, coveragePolicy, specialPeriods] = await Promise.all([
    prisma.boutiqueConfiguration.findUnique({ where: { boutiqueId } }),
    prisma.boutiqueShiftTemplate.findMany({
      where: { boutiqueId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.boutiqueCoveragePolicy.findMany({ where: { boutiqueId }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.boutiqueSpecialOperatingPeriod.findMany({ where: { boutiqueId }, orderBy: { startDate: 'asc' } }),
  ]);
  return { config, shiftTemplates, coveragePolicy, specialPeriods };
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(ADMIN_ROLES);
  } catch (e) {
    return authError(e);
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId');
  const boutiques = await loadBoutiques();
  if (!boutiqueId) {
    return NextResponse.json({ boutiques });
  }
  const bundle = await loadConfigBundle(boutiqueId);
  return NextResponse.json({ boutiques, ...bundle });
}

/** Create/initialize configuration (with safe defaults) for a single boutique. */
export async function POST(request: NextRequest) {
  try {
    await requireRole(ADMIN_ROLES);
  } catch (e) {
    return authError(e);
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId : '';
  if (!boutiqueId) return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });

  const boutique = await prisma.boutique.findUnique({ where: { id: boutiqueId } });
  if (!boutique) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });

  const summary = await backfillBoutiqueConfiguration(boutiqueId);
  const bundle = await loadConfigBundle(boutiqueId);
  return NextResponse.json({ summary, ...bundle });
}

type PatchConfig = Partial<typeof DEFAULT_BOUTIQUE_CONFIGURATION>;

function validateConfig(config: PatchConfig, errors: ValidationError[]) {
  const timeFields: Array<keyof typeof DEFAULT_BOUTIQUE_CONFIGURATION> = [
    'normalOpenTime',
    'normalCloseTime',
    'fridayOpenTime',
    'fridayCloseTime',
  ];
  for (const field of timeFields) {
    if (config[field] !== undefined && !isValidTime(config[field] as string)) {
      errors.push({ field, message: 'Invalid time format (expected HH:mm)' });
    }
  }
  if (config.normalOpenTime && config.normalCloseTime && !isValidTimeRange(config.normalOpenTime, config.normalCloseTime)) {
    errors.push({ field: 'normalCloseTime', message: 'Close time must be after open time' });
  }
  if (config.fridayOpenTime && config.fridayCloseTime && !isValidTimeRange(config.fridayOpenTime, config.fridayCloseTime)) {
    errors.push({ field: 'fridayCloseTime', message: 'Friday close time must be after open time' });
  }
  if (config.weeklyOffPolicy !== undefined && !WEEKLY_OFF_POLICIES.includes(config.weeklyOffPolicy)) {
    errors.push({ field: 'weeklyOffPolicy', message: 'Invalid weekly off policy' });
  }
  if (config.externalSupportPriority !== undefined && !EXTERNAL_SUPPORT_PRIORITIES.includes(config.externalSupportPriority)) {
    errors.push({ field: 'externalSupportPriority', message: 'Invalid external support priority' });
  }
  if (config.planningStrategy !== undefined && !PLANNING_STRATEGIES.includes(config.planningStrategy)) {
    errors.push({ field: 'planningStrategy', message: 'Invalid planning strategy' });
  }
  if (config.maxDeferredWeeklyOffPerWeek !== undefined && !isNonNegativeInt(config.maxDeferredWeeklyOffPerWeek)) {
    errors.push({ field: 'maxDeferredWeeklyOffPerWeek', message: 'Must be a non-negative integer' });
  }
  if (config.maxOvertimeHoursPerEmployeePerDay !== undefined && !isNonNegativeInt(config.maxOvertimeHoursPerEmployeePerDay)) {
    errors.push({ field: 'maxOvertimeHoursPerEmployeePerDay', message: 'Must be a non-negative integer' });
  }
  if (config.maxBridgeDaysPerEmployeePerWeek !== undefined && !isNonNegativeInt(config.maxBridgeDaysPerEmployeePerWeek)) {
    errors.push({ field: 'maxBridgeDaysPerEmployeePerWeek', message: 'Must be a non-negative integer' });
  }
}

/** Full save from the admin UI: upsert config, replace templates/coverage/special periods for a boutique. */
export async function PATCH(request: NextRequest) {
  try {
    await requireRole(ADMIN_ROLES);
  } catch (e) {
    return authError(e);
  }

  const body = await request.json().catch(() => ({}));
  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId : '';
  if (!boutiqueId) return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });

  const boutique = await prisma.boutique.findUnique({ where: { id: boutiqueId } });
  if (!boutique) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });

  const errors: ValidationError[] = [];
  const config: PatchConfig | undefined = body.config;
  const shiftTemplates: unknown[] | undefined = Array.isArray(body.shiftTemplates) ? body.shiftTemplates : undefined;
  const coveragePolicy: unknown[] | undefined = Array.isArray(body.coveragePolicy) ? body.coveragePolicy : undefined;
  const specialPeriods: unknown[] | undefined = Array.isArray(body.specialPeriods) ? body.specialPeriods : undefined;

  if (config) validateConfig(config, errors);

  const templatesData: Array<{
    code: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    secondStartTime: string | null;
    secondEndTime: string | null;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }> = [];
  if (shiftTemplates) {
    shiftTemplates.forEach((raw, i) => {
      const t = raw as Record<string, unknown>;
      const code = String(t.code ?? '').trim();
      const name = String(t.name ?? '').trim();
      const type = String(t.type ?? 'CUSTOM');
      const startTime = String(t.startTime ?? '');
      const endTime = String(t.endTime ?? '');
      const secondStartTime = t.secondStartTime ? String(t.secondStartTime) : null;
      const secondEndTime = t.secondEndTime ? String(t.secondEndTime) : null;
      if (!code) errors.push({ field: `shiftTemplates[${i}].code`, message: 'Code is required' });
      if (!name) errors.push({ field: `shiftTemplates[${i}].name`, message: 'Name is required' });
      if (!SHIFT_TEMPLATE_TYPES.includes(type as never)) errors.push({ field: `shiftTemplates[${i}].type`, message: 'Invalid type' });
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        errors.push({ field: `shiftTemplates[${i}]`, message: 'Invalid start/end time' });
      } else if (!isValidTimeRange(startTime, endTime)) {
        errors.push({ field: `shiftTemplates[${i}]`, message: 'End must be after start' });
      }
      if (secondStartTime || secondEndTime) {
        if (!isValidTime(secondStartTime ?? '') || !isValidTime(secondEndTime ?? '')) {
          errors.push({ field: `shiftTemplates[${i}].second`, message: 'Invalid second segment time' });
        } else if (!isValidTimeRange(secondStartTime as string, secondEndTime as string)) {
          errors.push({ field: `shiftTemplates[${i}].second`, message: 'Second end must be after start' });
        }
      }
      templatesData.push({
        code,
        name,
        type,
        startTime,
        endTime,
        secondStartTime,
        secondEndTime,
        isDefault: Boolean(t.isDefault),
        isActive: t.isActive === undefined ? true : Boolean(t.isActive),
        sortOrder: isNonNegativeInt(Number(t.sortOrder)) ? Number(t.sortOrder) : i,
      });
    });
    const codes = templatesData.map((t) => t.code);
    if (new Set(codes).size !== codes.length) errors.push({ field: 'shiftTemplates', message: 'Duplicate template codes' });
  }

  const coverageData: Array<{
    dayOfWeek: number;
    minMorning: number;
    minEvening: number;
    minTotal: number | null;
    isFridayOverride: boolean;
    isActive: boolean;
  }> = [];
  if (coveragePolicy) {
    coveragePolicy.forEach((raw, i) => {
      const c = raw as Record<string, unknown>;
      const dayOfWeek = Number(c.dayOfWeek);
      const minMorning = Number(c.minMorning);
      const minEvening = Number(c.minEvening);
      const minTotal = c.minTotal === null || c.minTotal === undefined || c.minTotal === '' ? null : Number(c.minTotal);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        errors.push({ field: `coveragePolicy[${i}].dayOfWeek`, message: 'Day must be 0..6' });
      }
      if (!isNonNegativeInt(minMorning)) errors.push({ field: `coveragePolicy[${i}].minMorning`, message: 'Coverage cannot be negative' });
      if (!isNonNegativeInt(minEvening)) errors.push({ field: `coveragePolicy[${i}].minEvening`, message: 'Coverage cannot be negative' });
      if (minTotal !== null && !isNonNegativeInt(minTotal)) errors.push({ field: `coveragePolicy[${i}].minTotal`, message: 'Coverage cannot be negative' });
      coverageData.push({
        dayOfWeek,
        minMorning,
        minEvening,
        minTotal,
        isFridayOverride: Boolean(c.isFridayOverride),
        isActive: c.isActive === undefined ? true : Boolean(c.isActive),
      });
    });
    const days = coverageData.map((c) => c.dayOfWeek);
    if (new Set(days).size !== days.length) errors.push({ field: 'coveragePolicy', message: 'Duplicate day entries' });
  }

  const periodsData: Array<{
    name: string;
    type: string;
    startDate: Date;
    endDate: Date;
    openTime: string;
    closeTime: string;
    secondOpenTime: string | null;
    secondCloseTime: string | null;
    minMorningCoverage: number | null;
    minEveningCoverage: number | null;
    minTotalCoverage: number | null;
    suspendWeeklyOff: boolean;
    allowExternalSupport: boolean;
    notes: string | null;
    isActive: boolean;
  }> = [];
  if (specialPeriods) {
    specialPeriods.forEach((raw, i) => {
      const p = raw as Record<string, unknown>;
      const name = String(p.name ?? '').trim();
      const type = String(p.type ?? 'CUSTOM');
      const startDate = parseDateOnly(p.startDate);
      const endDate = parseDateOnly(p.endDate);
      const openTime = String(p.openTime ?? '');
      const closeTime = String(p.closeTime ?? '');
      const secondOpenTime = p.secondOpenTime ? String(p.secondOpenTime) : null;
      const secondCloseTime = p.secondCloseTime ? String(p.secondCloseTime) : null;
      const parseOptInt = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
      const minMorningCoverage = parseOptInt(p.minMorningCoverage);
      const minEveningCoverage = parseOptInt(p.minEveningCoverage);
      const minTotalCoverage = parseOptInt(p.minTotalCoverage);
      if (!name) errors.push({ field: `specialPeriods[${i}].name`, message: 'Name is required' });
      if (!SPECIAL_PERIOD_TYPES.includes(type as never)) errors.push({ field: `specialPeriods[${i}].type`, message: 'Invalid type' });
      if (!startDate || !endDate) {
        errors.push({ field: `specialPeriods[${i}]`, message: 'Invalid date range' });
      } else if (endDate.getTime() < startDate.getTime()) {
        errors.push({ field: `specialPeriods[${i}]`, message: 'End date must not be before start date' });
      }
      if (!isValidTime(openTime) || !isValidTime(closeTime)) {
        errors.push({ field: `specialPeriods[${i}]`, message: 'Invalid open/close time' });
      } else if (!isValidTimeRange(openTime, closeTime)) {
        errors.push({ field: `specialPeriods[${i}]`, message: 'Close must be after open' });
      }
      for (const [val, label] of [[minMorningCoverage, 'minMorningCoverage'], [minEveningCoverage, 'minEveningCoverage'], [minTotalCoverage, 'minTotalCoverage']] as const) {
        if (val !== null && !isNonNegativeInt(val)) errors.push({ field: `specialPeriods[${i}].${label}`, message: 'Coverage cannot be negative' });
      }
      periodsData.push({
        name,
        type,
        startDate: startDate ?? new Date(0),
        endDate: endDate ?? new Date(0),
        openTime,
        closeTime,
        secondOpenTime,
        secondCloseTime,
        minMorningCoverage,
        minEveningCoverage,
        minTotalCoverage,
        suspendWeeklyOff: Boolean(p.suspendWeeklyOff),
        allowExternalSupport: p.allowExternalSupport === undefined ? true : Boolean(p.allowExternalSupport),
        notes: p.notes ? String(p.notes) : null,
        isActive: p.isActive === undefined ? true : Boolean(p.isActive),
      });
    });
  }

  if (errors.length) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (config) {
      await tx.boutiqueConfiguration.upsert({
        where: { boutiqueId },
        update: { ...config },
        create: { boutiqueId, ...DEFAULT_BOUTIQUE_CONFIGURATION, ...config },
      });
    }
    if (shiftTemplates) {
      await tx.boutiqueShiftTemplate.deleteMany({ where: { boutiqueId } });
      if (templatesData.length) {
        await tx.boutiqueShiftTemplate.createMany({
          data: templatesData.map((t) => ({ boutiqueId, ...t, type: t.type as never })),
        });
      }
    }
    if (coveragePolicy) {
      await tx.boutiqueCoveragePolicy.deleteMany({ where: { boutiqueId } });
      if (coverageData.length) {
        await tx.boutiqueCoveragePolicy.createMany({ data: coverageData.map((c) => ({ boutiqueId, ...c })) });
      }
    }
    if (specialPeriods) {
      await tx.boutiqueSpecialOperatingPeriod.deleteMany({ where: { boutiqueId } });
      if (periodsData.length) {
        await tx.boutiqueSpecialOperatingPeriod.createMany({
          data: periodsData.map((p) => ({ boutiqueId, ...p, type: p.type as never })),
        });
      }
    }
  });

  const bundle = await loadConfigBundle(boutiqueId);
  return NextResponse.json({ ok: true, ...bundle });
}
