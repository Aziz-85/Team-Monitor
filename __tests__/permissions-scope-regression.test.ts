/**
 * Phase 7 — consolidated permission / scope / import security regression suite.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  boutiqueApplyPlanSchema,
  employeeApplyPlanSchema,
  yearlySalesApplyPlanSchema,
} from '@/lib/validation';

const BOUTIQUE_A = 'boutique-a';
const BOUTIQUE_B = 'boutique-b';

describe('import apply routes use Zod validation', () => {
  const routes = [
    'app/api/targets/import/boutiques/apply/route.ts',
    'app/api/targets/import/employees/apply/route.ts',
    'app/api/sales/import/yearly/apply/route.ts',
    'app/api/sales/import-ledger/route.ts',
  ];

  it.each(routes)('%s imports from lib/validation', (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), 'utf-8');
    expect(src).toMatch(/@\/lib\/validation/);
  });
});

describe('cross-boutique apply plan rejection', () => {
  const outOfScopeBoutiqueRow = {
    month: '2026-07',
    boutiqueId: BOUTIQUE_B,
    boutiqueName: 'Other',
    target: 1000,
    source: 'import',
    notes: '',
  };

  it('boutique apply plan rejects foreign boutiqueId in inserts', () => {
    expect(
      boutiqueApplyPlanSchema([BOUTIQUE_A]).safeParse({
        inserts: [outOfScopeBoutiqueRow],
        updates: [],
      }).success
    ).toBe(false);
  });

  it('employee apply plan rejects foreign boutiqueId in updates', () => {
    expect(
      employeeApplyPlanSchema([BOUTIQUE_A]).safeParse({
        inserts: [],
        updates: [
          {
            id: 't1',
            userId: 'u1',
            ...outOfScopeBoutiqueRow,
          },
        ],
      }).success
    ).toBe(false);
  });

  it('yearly sales apply plan rejects boutique mismatch', () => {
    expect(
      yearlySalesApplyPlanSchema(BOUTIQUE_A).safeParse({
        boutiqueId: BOUTIQUE_B,
        fileName: 'x.xlsx',
        fileSha256: 'a'.repeat(64),
        writes: [],
      }).success
    ).toBe(false);
  });
});

describe('security regression file presence', () => {
  const requiredSuites = [
    '__tests__/boutique-access-security.test.ts',
    '__tests__/auth-mutation-security.test.ts',
    '__tests__/demo-viewer-security.test.ts',
    '__tests__/import-pipeline.test.ts',
    '__tests__/validation.test.ts',
  ];

  it.each(requiredSuites)('includes %s', (file) => {
    expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
  });
});
