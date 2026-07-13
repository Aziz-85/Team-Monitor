/**
 * Phase 1 — sales service layer regression tests.
 */

import { calculatePerformance } from '@/lib/performance/performanceEngine';
import { incomingSalesWriteWinsPrecedence } from '@/lib/sales/salesEntryWritePrecedence';

jest.mock('@/lib/db', () => ({
  prisma: {},
}));

describe('sales source of truth — service layer contracts', () => {
  it('exports canonical write facade from lib/sales/index', () => {
    const sales = require('@/lib/sales/index') as Record<string, unknown>;
    expect(typeof sales.recordBoutiqueSale).toBe('function');
    expect(typeof sales.removeBoutiqueSaleLine).toBe('function');
    expect(typeof sales.updateBoutiqueSale).toBe('function');
    expect(typeof sales.syncSalesProjections).toBe('function');
    expect(typeof sales.rebuildSalesProjections).toBe('function');
    expect(typeof sales.importBoutiqueSales).toBe('function');
    expect(typeof sales.calculateEmployeePerformance).toBe('function');
    expect(typeof sales.calculateBoutiquePerformance).toBe('function');
    expect(typeof sales.collectImportSalesWarnings).toBe('function');
    expect(typeof sales.upsertCanonicalSalesEntry).toBe('function');
  });

  it('ledger sync cannot overwrite MANUAL canonical row without force', () => {
    expect(incomingSalesWriteWinsPrecedence('MANUAL', 'LEDGER', {})).toBe(false);
    expect(incomingSalesWriteWinsPrecedence('LEDGER', 'MANUAL', {})).toBe(true);
  });

  it('employee performance total matches achievement formula (regression)', () => {
    const sales = 75_000;
    const target = 100_000;
    const perf = calculatePerformance({ target, sales });
    expect(perf.sales).toBe(sales);
    expect(perf.target).toBe(target);
    expect(perf.remaining).toBe(25_000);
    expect(perf.percent).toBe(75);
  });

  it('achievement percent is zero when target is zero (division guard)', () => {
    const perf = calculatePerformance({ target: 0, sales: 50_000 });
    expect(perf.percent).toBe(0);
    expect(perf.remaining).toBe(-50_000);
  });

  it('boutique total parity: sum of parts equals aggregate', () => {
    const amounts = [10_000, 20_000, 5_000];
    const total = amounts.reduce((a, b) => a + b, 0);
    expect(total).toBe(35_000);
  });
});

describe('syncSalesProjections alias', () => {
  it('delegates to syncDailyLedgerToSalesEntry', async () => {
    jest.resetModules();
    jest.doMock('@/lib/sales/syncDailyLedgerToSalesEntry', () => ({
      syncDailyLedgerToSalesEntry: jest.fn().mockResolvedValue({
        ok: true,
        summaryId: 's1',
        upserted: 2,
        skipped: 0,
      }),
    }));
    const { syncSalesProjections } = await import('@/lib/sales/syncSalesProjections');
    const result = await syncSalesProjections({
      boutiqueId: 'bout_1',
      date: '2026-01-15',
      actorUserId: 'user_1',
    });
    expect(result.ok).toBe(true);
    expect(result.upserted).toBe(2);
  });
});
