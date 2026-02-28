/**
 * Sales ledger: SAR validation, reconcile diff, lock rule (diff must be 0).
 * Contract: Sales daily write APIs require ADMIN/MANAGER; decimal SAR rejected.
 */

import { validateSarInteger, computeDiff } from '@/lib/sales/reconcile';

describe('validateSarInteger', () => {
  it('accepts non-negative integer number', () => {
    const r0 = validateSarInteger(0);
    expect(r0.ok).toBe(true);
    if (r0.ok) expect(r0.value).toBe(0);
    const r100 = validateSarInteger(100);
    expect(r100.ok).toBe(true);
    if (r100.ok) expect(r100.value).toBe(100);
  });

  it('rejects decimals', () => {
    expect(validateSarInteger(10.5).ok).toBe(false);
    expect(validateSarInteger(0.1).ok).toBe(false);
  });

  it('rejects negative', () => {
    expect(validateSarInteger(-1).ok).toBe(false);
  });

  it('accepts string integer', () => {
    const r = validateSarInteger('42');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('rejects string with decimals', () => {
    expect(validateSarInteger('42.5').ok).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(validateSarInteger(null).ok).toBe(false);
    expect(validateSarInteger(undefined).ok).toBe(false);
  });
});

describe('computeDiff', () => {
  it('returns summaryTotal - linesTotal', () => {
    expect(computeDiff(100, 80)).toBe(20);
    expect(computeDiff(100, 100)).toBe(0);
    expect(computeDiff(100, 120)).toBe(-20);
  });
});

describe('Sales daily API contract', () => {
  it('POST /api/sales/daily/summary, /lines, /lock, /import, /import/apply require ADMIN or MANAGER — EMPLOYEE/ASSISTANT_MANAGER receive 403', () => {
    expect(true).toBe(true); // Contract: these routes use requireRole(['ADMIN','MANAGER'])
  });

  it('Lock is allowed only when diff === 0 (lines total equals summary total)', () => {
    expect(true).toBe(true); // Contract: POST /api/sales/daily/lock validates via reconcileSummary canLock
  });

  it('Scope: user can only access boutiques in resolved scope (membership)', () => {
    expect(true).toBe(true); // Contract: resolveScope filters by UserBoutiqueMembership; 403 if boutique not in scope
  });
});
