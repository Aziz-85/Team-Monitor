/**
 * Boutique Configuration foundation tests.
 * Covers: defaults, backfill (incl. CoverageRule copy), special-period override,
 * Friday hours, time validation, and API role gating (ADMIN/SUPER_ADMIN allowed, MANAGER denied).
 */

import type { Role } from '@prisma/client';

// ---- Prisma mock ------------------------------------------------------------
type AnyRec = Record<string, unknown>;
const transactionMock = jest.fn();
const db = {
  boutique: { findMany: jest.fn(), findUnique: jest.fn() },
  boutiqueConfiguration: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
  boutiqueShiftTemplate: { findMany: jest.fn(), create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  boutiqueCoveragePolicy: { findMany: jest.fn(), create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  boutiqueSpecialOperatingPeriod: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  coverageRule: { findMany: jest.fn() },
  $transaction: transactionMock,
};
transactionMock.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
jest.mock('@/lib/db', () => ({ prisma: db }));

// ---- Auth mock --------------------------------------------------------------
let currentRole: Role | null = 'ADMIN';
jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(async (roles: string[]) => {
    if (!currentRole) {
      const e = new Error('unauthorized') as Error & { code: string };
      e.code = 'UNAUTHORIZED';
      throw e;
    }
    if (!roles.includes(currentRole)) {
      const e = new Error('forbidden') as Error & { code: string };
      e.code = 'FORBIDDEN';
      throw e;
    }
    return { role: currentRole };
  }),
}));

import {
  DEFAULT_BOUTIQUE_CONFIGURATION,
  defaultCoveragePolicy,
  FRIDAY_DAY_OF_WEEK,
} from '@/lib/boutique-config/defaults';
import { isValidTime, isValidTimeRange } from '@/lib/boutique-config/validation';
import { getBoutiqueConfiguration } from '@/lib/boutique-config/getBoutiqueConfiguration';
import { backfillBoutiqueConfiguration } from '@/lib/boutique-config/backfill';

function resetDb() {
  Object.values(db).forEach((model) => {
    if (typeof model === 'function') return;
    Object.values(model as AnyRec).forEach((fn) => (fn as jest.Mock).mockReset?.());
  });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  // Sensible empty defaults
  db.boutiqueConfiguration.findUnique.mockResolvedValue(null);
  db.boutiqueShiftTemplate.findMany.mockResolvedValue([]);
  db.boutiqueCoveragePolicy.findMany.mockResolvedValue([]);
  db.boutiqueSpecialOperatingPeriod.findMany.mockResolvedValue([]);
  db.coverageRule.findMany.mockResolvedValue([]);
  db.boutiqueConfiguration.create.mockResolvedValue({});
  db.boutiqueShiftTemplate.create.mockResolvedValue({});
  db.boutiqueCoveragePolicy.create.mockResolvedValue({});
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDb();
  currentRole = 'ADMIN';
});

describe('defaults', () => {
  it('exposes safe default configuration values', () => {
    expect(DEFAULT_BOUTIQUE_CONFIGURATION.timezone).toBe('Asia/Riyadh');
    expect(DEFAULT_BOUTIQUE_CONFIGURATION.normalOpenTime).toBe('09:30');
    expect(DEFAULT_BOUTIQUE_CONFIGURATION.fridayOpenTime).toBe('16:00');
    expect(DEFAULT_BOUTIQUE_CONFIGURATION.planningStrategy).toBe('MAXIMUM_COVERAGE');
  });

  it('creates a coverage policy for every day with Friday PM-only', () => {
    const policy = defaultCoveragePolicy();
    expect(policy).toHaveLength(7);
    const friday = policy.find((p) => p.dayOfWeek === FRIDAY_DAY_OF_WEEK);
    expect(friday?.minMorning).toBe(0);
    expect(friday?.minEvening).toBe(2);
    const saturday = policy.find((p) => p.dayOfWeek === 6);
    expect(saturday?.minMorning).toBe(2);
    expect(saturday?.minEvening).toBe(2);
  });
});

describe('backfill', () => {
  it('creates configuration, templates, and policies for an active boutique', async () => {
    db.boutique.findMany.mockResolvedValue([{ id: 'b1', code: '01', name: 'Rashid', isActive: true }]);

    const summary = await backfillBoutiqueConfiguration();

    expect(summary.boutiquesProcessed).toBe(1);
    expect(summary.configsCreated).toBe(1);
    expect(summary.templatesCreated).toBe(3); // Morning/Evening/Bridge
    expect(summary.policiesCreated).toBe(7);
    expect(db.boutiqueConfiguration.create).toHaveBeenCalledTimes(1);
  });

  it('copies legacy CoverageRule values into BoutiqueCoveragePolicy', async () => {
    db.boutique.findMany.mockResolvedValue([{ id: 'b1', code: '01', name: 'Rashid', isActive: true }]);
    db.coverageRule.findMany.mockResolvedValue([
      { boutiqueId: 'b1', dayOfWeek: 1, minAM: 3, minPM: 4, enabled: true },
    ]);

    const summary = await backfillBoutiqueConfiguration();

    expect(summary.policiesCopiedFromCoverageRule).toBe(1);
    const copiedCall = db.boutiqueCoveragePolicy.create.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { dayOfWeek: number } }).data.dayOfWeek === 1
    );
    expect(copiedCall).toBeDefined();
    const data = (copiedCall![0] as { data: { minMorning: number; minEvening: number } }).data;
    expect(data.minMorning).toBe(3);
    expect(data.minEvening).toBe(4);
  });
});

describe('getBoutiqueConfiguration', () => {
  it('falls back to defaults when no configuration row exists', async () => {
    const resolved = await getBoutiqueConfiguration('b1', new Date('2026-02-02T12:00:00Z')); // Monday
    expect(resolved.usingDefaults).toBe(true);
    expect(resolved.operatingHours.source).toBe('NORMAL');
    expect(resolved.operatingHours.openTime).toBe('09:30');
  });

  it('uses Friday hours on Friday', async () => {
    db.boutiqueConfiguration.findUnique.mockResolvedValue({
      ...DEFAULT_BOUTIQUE_CONFIGURATION,
      boutiqueId: 'b1',
    });
    const friday = new Date('2026-02-06T12:00:00Z'); // Friday
    const resolved = await getBoutiqueConfiguration('b1', friday);
    expect(resolved.operatingHours.source).toBe('FRIDAY');
    expect(resolved.operatingHours.openTime).toBe('16:00');
  });

  it('special period overrides normal operating hours', async () => {
    db.boutiqueConfiguration.findUnique.mockResolvedValue({
      ...DEFAULT_BOUTIQUE_CONFIGURATION,
      boutiqueId: 'b1',
    });
    db.boutiqueSpecialOperatingPeriod.findMany.mockResolvedValue([
      {
        id: 'sp1',
        name: 'Ramadan',
        type: 'RAMADAN',
        startDate: new Date('2026-02-01T00:00:00Z'),
        endDate: new Date('2026-03-01T00:00:00Z'),
        openTime: '21:00',
        closeTime: '02:00',
        secondOpenTime: null,
        secondCloseTime: null,
        minMorningCoverage: null,
        minEveningCoverage: null,
        minTotalCoverage: null,
        suspendWeeklyOff: false,
        allowExternalSupport: true,
        notes: null,
        isActive: true,
      },
    ]);
    const during = new Date('2026-02-10T12:00:00Z');
    const resolved = await getBoutiqueConfiguration('b1', during);
    expect(resolved.operatingHours.source).toBe('SPECIAL_PERIOD');
    expect(resolved.operatingHours.openTime).toBe('21:00');
    expect(resolved.activeSpecialPeriod?.name).toBe('Ramadan');
  });
});

describe('time validation', () => {
  it('accepts valid HH:mm times', () => {
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });
  it('rejects invalid times', () => {
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('foo')).toBe(false);
  });
  it('requires end after start unless crossing midnight allowed', () => {
    expect(isValidTimeRange('09:30', '17:30')).toBe(true);
    expect(isValidTimeRange('17:30', '09:30')).toBe(false);
    expect(isValidTimeRange('22:00', '02:00', true)).toBe(true);
  });
});

describe('API role gating', () => {
  async function callGet(role: Role | null) {
    currentRole = role;
    const { GET } = await import('@/app/api/admin/boutique-configuration/route');
    db.boutique.findMany.mockResolvedValue([]);
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as import('next/server').NextRequest;
    return GET(req);
  }

  it('allows ADMIN', async () => {
    const res = await callGet('ADMIN');
    expect(res.status).toBe(200);
  });

  it('allows SUPER_ADMIN', async () => {
    const res = await callGet('SUPER_ADMIN');
    expect(res.status).toBe(200);
  });

  it('denies MANAGER with 403', async () => {
    const res = await callGet('MANAGER');
    expect(res.status).toBe(403);
  });

  it('rejects invalid time via PATCH with 400', async () => {
    currentRole = 'ADMIN';
    db.boutique.findUnique.mockResolvedValue({ id: 'b1' });
    const { PATCH } = await import('@/app/api/admin/boutique-configuration/route');
    const req = {
      json: async () => ({ boutiqueId: 'b1', config: { normalOpenTime: '9:30' } }),
    } as unknown as import('next/server').NextRequest;
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
