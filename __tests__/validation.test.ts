/**
 * Phase 6 — Zod validation schemas and helpers.
 */

import {
  boutiqueApplyPlanSchema,
  employeeApplyPlanSchema,
  formatZodError,
  importLedgerBodySchema,
  parseJsonString,
  userCreateSchema,
  userPatchSchema,
  yearlySalesApplyPlanSchema,
} from '@/lib/validation';
import { parseBoutiqueApplyPlan, parseEmployeeApplyPlan } from '@/lib/targets/applyImportPlan';
import { parseYearlySalesApplyPlan } from '@/lib/sales/yearlyEmployeeSalesImport';

const BOUTIQUE_A = 'boutique-a';
const BOUTIQUE_B = 'boutique-b';
const ALLOWED = [BOUTIQUE_A];

describe('formatZodError', () => {
  it('returns path and message without stack trace', () => {
    const parsed = userCreateSchema.safeParse({ empId: '', password: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const message = formatZodError(parsed.error);
    expect(message).toContain('empId');
    expect(message).not.toContain('ZodError');
    expect(message).not.toContain('stack');
  });
});

describe('userCreateSchema', () => {
  it('accepts valid admin user payload', () => {
    const result = userCreateSchema.safeParse({
      empId: 'E100',
      password: 'Str0ng!Pass',
      role: 'MANAGER',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.role).toBe('MANAGER');
  });

  it('rejects invalid role', () => {
    const result = userCreateSchema.safeParse({
      empId: 'E100',
      password: 'x',
      role: 'SUPER_ADMIN',
    });
    expect(result.success).toBe(false);
  });
});

describe('userPatchSchema', () => {
  it('requires at least one mutable field', () => {
    const result = userPatchSchema.safeParse({ empId: 'E1' });
    expect(result.success).toBe(false);
  });

  it('accepts partial patch', () => {
    const result = userPatchSchema.safeParse({ empId: 'E1', disabled: true });
    expect(result.success).toBe(true);
  });
});

describe('targets import apply plans', () => {
  const validBoutiquePlan = {
    inserts: [
      {
        month: '2026-07',
        boutiqueId: BOUTIQUE_A,
        boutiqueName: 'A',
        target: 1000,
        source: 'import',
        notes: '',
      },
    ],
    updates: [],
  };

  it('parseBoutiqueApplyPlan accepts in-scope boutique', () => {
    expect(parseBoutiqueApplyPlan(validBoutiquePlan, ALLOWED)).toEqual(validBoutiquePlan);
  });

  it('parseBoutiqueApplyPlan rejects out-of-scope boutique', () => {
    const outOfScope = {
      ...validBoutiquePlan,
      inserts: [{ ...validBoutiquePlan.inserts[0], boutiqueId: BOUTIQUE_B }],
    };
    expect(parseBoutiqueApplyPlan(outOfScope, ALLOWED)).toBeNull();
  });

  it('employee apply plan enforces boutique scope on updates', () => {
    const plan = {
      inserts: [],
      updates: [
        {
          id: 't1',
          month: '2026-07',
          boutiqueId: BOUTIQUE_B,
          userId: 'u1',
          target: 500,
          source: 'import',
          notes: '',
        },
      ],
    };
    expect(parseEmployeeApplyPlan(plan, ALLOWED)).toBeNull();
    expect(employeeApplyPlanSchema(ALLOWED).safeParse(plan).success).toBe(false);
  });
});

describe('yearly sales apply plan', () => {
  const boutiqueId = BOUTIQUE_A;
  const validPlan = {
    boutiqueId,
    fileName: 'sales.xlsx',
    fileSha256: 'a'.repeat(64),
    year: '2026',
    monthRange: { from: '2026-01-01', to: '2026-12-31' },
    writes: [
      {
        dateKey: '2026-01-15',
        dateIso: '2026-01-15T00:00:00.000Z',
        userId: 'u1',
        empId: 'E1',
        amount: 100,
        action: 'INSERT',
        stableKey: 'k1',
      },
    ],
  };

  it('parseYearlySalesApplyPlan accepts matching boutique', () => {
    const plan = parseYearlySalesApplyPlan(validPlan, boutiqueId);
    expect(plan?.boutiqueId).toBe(boutiqueId);
    expect(plan?.writes).toHaveLength(1);
  });

  it('rejects boutique mismatch', () => {
    expect(parseYearlySalesApplyPlan(validPlan, BOUTIQUE_B)).toBeNull();
    expect(yearlySalesApplyPlanSchema(BOUTIQUE_B).safeParse(validPlan).success).toBe(false);
  });
});

describe('importLedgerBodySchema', () => {
  it('requires boutiqueId and periodKey', () => {
    const result = importLedgerBodySchema.safeParse({ rows: [] });
    expect(result.success).toBe(false);
  });

  it('defaults fileName and rows', () => {
    const result = importLedgerBodySchema.safeParse({
      boutiqueId: BOUTIQUE_A,
      periodKey: '2026-07',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fileName).toBe('import');
    expect(result.data.rows).toEqual([]);
  });

  it('parseJsonString maps invalid JSON to friendly error path', () => {
    const parsed = parseJsonString('not-json', importLedgerBodySchema);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);
  });
});

describe('boutiqueApplyPlanSchema direct', () => {
  it('rejects non-array inserts', () => {
    const result = boutiqueApplyPlanSchema(ALLOWED).safeParse({ inserts: {}, updates: [] });
    expect(result.success).toBe(false);
  });
});
