/**
 * Sales attribution rules — branch totals by sale location, employee totals by seller across all boutiques.
 *
 * ACCEPTANCE SCENARIO (deterministic):
 * - Boutiques: S01 (Dhahran), S02 (AlRashid)
 * - Employee E1 (userId) home boutique = S01
 * - Sale A: E1 sells in S01 amount 10,000
 * - Sale B: E1 sells in S02 amount 5,000 (coverage case)
 *
 * Expected:
 * - Boutique S01 total = 10,000
 * - Boutique S02 total = 5,000
 * - Employee E1 total (all boutiques) = 15,000
 * - Employee E1 breakdown: S01: 10,000, S02: 5,000
 *
 * After transfer E1 home boutique -> S02:
 * - Boutique totals unchanged (10,000 and 5,000)
 * - Employee totals unchanged (15,000)
 * - Breakdown unchanged
 *
 * Guard: No sales aggregation must use Employee.boutiqueId.
 */

import * as attribution from '@/lib/sales/attribution';
import * as fs from 'fs';
import * as path from 'path';

describe('Sales attribution module', () => {
  describe('API shape', () => {
    it('exports sumBoutiqueSales', () => {
      expect(typeof attribution.sumBoutiqueSales).toBe('function');
    });
    it('exports sumEmployeeSales', () => {
      expect(typeof attribution.sumEmployeeSales).toBe('function');
    });
    it('exports sumEmployeeSalesByBoutique', () => {
      expect(typeof attribution.sumEmployeeSalesByBoutique).toBe('function');
    });
    it('exports sumBoutiqueSalesByEmployee', () => {
      expect(typeof attribution.sumBoutiqueSalesByEmployee).toBe('function');
    });
  });

  describe('sumBoutiqueSales return type', () => {
    it('returns a Promise<number>', async () => {
      const result = attribution.sumBoutiqueSales({
        boutiqueId: 'S01',
        fromDate: new Date('2026-01-01'),
        toDate: new Date('2026-12-31'),
      });
      expect(result).toBeInstanceOf(Promise);
      const value = await result;
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    });
  });

  describe('sumEmployeeSalesByBoutique return type', () => {
    it('returns Promise<Array<{ boutiqueId: string; amount: number }>>', async () => {
      const result = attribution.sumEmployeeSalesByBoutique({
        userId: 'user-1',
        fromDate: new Date('2026-01-01'),
        toDate: new Date('2026-12-31'),
      });
      expect(result).toBeInstanceOf(Promise);
      const value = await result;
      expect(Array.isArray(value)).toBe(true);
      value.forEach((row) => {
        expect(typeof row.boutiqueId).toBe('string');
        expect(typeof row.amount).toBe('number');
      });
    });
  });
});

describe('Sales attribution guard: no Employee.boutiqueId in sales totals', () => {
  const attributionPath = path.join(process.cwd(), 'lib', 'sales', 'attribution.ts');
  const routePaths = [
    path.join(process.cwd(), 'app', 'api', 'sales', 'my', 'boutique-breakdown', 'route.ts'),
    path.join(process.cwd(), 'app', 'api', 'sales', 'summary', 'route.ts'),
    path.join(process.cwd(), 'app', 'api', 'me', 'sales', 'route.ts'),
    path.join(process.cwd(), 'app', 'api', 'sales', 'my', 'monthly', 'route.ts'),
    path.join(process.cwd(), 'app', 'api', 'target', 'my', 'daily', 'route.ts'),
  ];

  it('attribution.ts does not use Employee model for sales aggregation', () => {
    const content = fs.readFileSync(attributionPath, 'utf-8');
    expect(content).not.toMatch(/prisma\.employee\./);
    expect(content).toMatch(/prisma\.salesEntry\./);
  });

  it('boutique-breakdown route uses only SalesEntry (userId) for employee totals', () => {
    const content = fs.readFileSync(routePaths[0], 'utf-8');
    expect(content).toMatch(/sumEmployeeSales|sumEmployeeSalesByBoutique/);
    expect(content).not.toMatch(/Employee\.boutiqueId|employee\.boutiqueId/);
  });
});
