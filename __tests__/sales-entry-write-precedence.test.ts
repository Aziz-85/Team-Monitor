import {
  getSalesEntrySourceRank,
  incomingSalesWriteWinsPrecedence,
} from '@/lib/sales/salesEntryWritePrecedence';

describe('salesEntryWritePrecedence', () => {
  it('ranks MANUAL > LEDGER > EXCEL_IMPORT > MATRIX', () => {
    expect(getSalesEntrySourceRank('MANUAL')).toBeGreaterThan(getSalesEntrySourceRank('LEDGER'));
    expect(getSalesEntrySourceRank('LEDGER')).toBeGreaterThan(getSalesEntrySourceRank('EXCEL_IMPORT'));
    expect(getSalesEntrySourceRank('EXCEL_IMPORT')).toBeGreaterThan(getSalesEntrySourceRank('MATRIX'));
  });

  it('allows same-source idempotent overwrite', () => {
    expect(incomingSalesWriteWinsPrecedence('MATRIX', 'MATRIX', {})).toBe(true);
    expect(incomingSalesWriteWinsPrecedence('matrix', 'MATRIX', {})).toBe(true);
  });

  it('rejects lower precedence over higher', () => {
    expect(incomingSalesWriteWinsPrecedence('LEDGER', 'MATRIX', {})).toBe(false);
    expect(incomingSalesWriteWinsPrecedence('MANUAL', 'LEDGER', {})).toBe(false);
    expect(incomingSalesWriteWinsPrecedence('EXCEL_IMPORT', 'MATRIX', {})).toBe(false);
  });

  it('allows higher over lower', () => {
    expect(incomingSalesWriteWinsPrecedence('MATRIX', 'EXCEL_IMPORT', {})).toBe(true);
    expect(incomingSalesWriteWinsPrecedence('MATRIX', 'LEDGER', {})).toBe(true);
    expect(incomingSalesWriteWinsPrecedence('LEDGER', 'MANUAL', {})).toBe(true);
  });

  it('forceAdminOverride bypasses precedence', () => {
    expect(incomingSalesWriteWinsPrecedence('MANUAL', 'MATRIX', { forceAdminOverride: true })).toBe(
      true
    );
  });

  it('ranks HISTORICAL_CORRECTION between LEDGER and HISTORICAL_IMPORT', () => {
    expect(getSalesEntrySourceRank('LEDGER')).toBeGreaterThan(
      getSalesEntrySourceRank('HISTORICAL_CORRECTION')
    );
    expect(getSalesEntrySourceRank('HISTORICAL_CORRECTION')).toBeGreaterThan(
      getSalesEntrySourceRank('HISTORICAL_IMPORT')
    );
  });
});
