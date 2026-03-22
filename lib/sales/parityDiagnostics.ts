/**
 * Formatting and batch runners for parity checks (tests + admin diagnostics).
 *
 * **Scope:** `runCoreParitySuite` is **SalesEntry-only** (see `parityEngine`). Under Policy A,
 * it does **not** validate ledger vs SalesEntry equality — see `HISTORICAL_LEDGER_RECONCILIATION_POLICY`.
 */

import type { ParityCheckResult } from '@/lib/sales/parityEngine';
import { runCoreParitySuite } from '@/lib/sales/parityEngine';
import { HISTORICAL_LEDGER_RECONCILIATION_POLICY } from '@/lib/sales/reconciliationPolicy';

export type ParityDiagnosticsPayload = {
  ok: boolean;
  failedContracts: string[];
  checks: Array<
    ParityCheckResult & {
      summary: string;
    }
  >;
  generatedAt: string;
  /** Explicit policy: parity suite does not compare SalesEntry to ledger. */
  reconciliationPolicy: typeof HISTORICAL_LEDGER_RECONCILIATION_POLICY;
};

function summarize(c: ParityCheckResult): string {
  if (c.status === 'PASS') return `${c.contractName}: OK`;
  return `${c.contractName}: FAIL (delta=${c.delta})${c.message ? ` — ${c.message}` : ''}`;
}

export function formatParityDiagnostics(checks: ParityCheckResult[]): ParityDiagnosticsPayload {
  const failed = checks.filter((c) => c.status === 'FAIL');
  return {
    ok: failed.length === 0,
    failedContracts: failed.map((c) => c.contractName),
    checks: checks.map((c) => ({
      ...c,
      summary: summarize(c),
    })),
    generatedAt: new Date().toISOString(),
    reconciliationPolicy: HISTORICAL_LEDGER_RECONCILIATION_POLICY,
  };
}

export async function runParityDiagnosticsForBoutique(input: {
  boutiqueId: string;
  monthKey: string;
  userId?: string;
  employeeCrossBoutique?: boolean;
}): Promise<ParityDiagnosticsPayload> {
  const checks = await runCoreParitySuite(input);
  return formatParityDiagnostics(checks);
}
