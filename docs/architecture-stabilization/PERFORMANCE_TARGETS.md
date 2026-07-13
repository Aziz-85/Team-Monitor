# Performance & Targets Unification

**Phase:** Architecture Stabilization Phase 5  
**Status:** Active  
**Date:** 2026-07-13

## 1. Goal

Same sales and target numbers on dashboard, performance summary, employee target APIs, and executive views for the same boutique / employee / month — with **missing targets represented explicitly**, not as zero.

## 2. Central Resolvers

| Module | Role |
|---|---|
| `lib/targets/getBoutiqueTarget.ts` | Boutique `BoutiqueMonthlyTarget` lookup |
| `lib/targets/getEmployeeTarget.ts` | Employee `EmployeeMonthlyTarget` lookup (scoped or cross-boutique) |
| `lib/targets/types.ts` | `TargetStatus`, `ResolvedBoutiqueTarget`, `ResolvedEmployeeTarget` |
| `lib/targets/index.ts` | Public facade |

### Missing-target contract

```typescript
{
  status: 'assigned' | 'missing',
  amountSar: number | null,      // null when missing
  hasMonthlyTarget: boolean,     // alias for UI
}
```

- **Missing row** → `status: 'missing'`, `amountSar: null`, `hasMonthlyTarget: false`
- **Row with amount 0** → `status: 'assigned'`, `amountSar: 0`, `hasMonthlyTarget: true`
- Achievement percent is **`null`** when target is missing (not `0%`)

## 3. Performance Getters

| Module | Role |
|---|---|
| `lib/sales/getBoutiquePerformance.ts` | SalesEntry sales + boutique target + achievement |
| `lib/sales/getEmployeePerformance.ts` | SalesEntry sales + employee target + achievement |
| `lib/sales/calculate*.ts` | Deprecated re-exports (backward compatible) |

Sales reads use `lib/sales/attribution.ts` (`sumBoutiqueSales`, `sumEmployeeSales`) → **SalesEntry only**.

## 4. Aggregator Integration

`lib/metrics/aggregator.ts` now uses central target resolvers:

| Function | Target source | Missing handling |
|---|---|---|
| `getTargetMetrics` | `getEmployeeTarget` + `getBoutiqueTarget` | `hasMonthlyTarget`, `monthTargetSar`, `pctMonth: null` |
| `getPerformanceSummary` | `getEmployeeTarget` / `getBoutiqueTarget` | `monthlyTargetSar: null` |
| `getDashboardSalesMetrics` | `getEmployeeTarget` / `getBoutiqueTarget` | `hasMonthlyTarget` |

### Employee API fields (new)

`GET /api/metrics/my-target` and `GET /api/me/targets` now include:

- `hasMonthlyTarget`
- `monthTargetSar` (null when missing)
- `targetStatus`

Legacy `monthTarget` remains for pace math (0 when missing).

## 5. Executive Monthly Alignment

`GET /api/executive/monthly`:

- **Revenue KPI** → canonical `SalesEntry` sum via `aggregateSalesEntrySum` (aligned with executive dashboard)
- **Target KPI** → `getBoutiqueTarget`
- **Achievement** → `null` when target missing
- Ledger breakdown kept in `sourceBreakdown` for diagnostics only (not used for headline revenue)

## 6. Canonical Surfaces (Phase 5)

| Surface | Route / function | Sales | Target |
|---|---|---|---|
| Manager dashboard | `getDashboardSalesMetrics` | SalesEntry | `getBoutiqueTarget` |
| Performance summary | `getPerformanceSummaryExtended` | SalesEntry | central resolver |
| Employee home | `getTargetMetrics` | SalesEntry | `getEmployeeTarget` |
| Executive dashboard | `readSalesAggregate` | SalesEntry | `sumBoutiqueMonthlyTargets` |
| Executive monthly | `aggregateSalesEntrySum` | SalesEntry | `getBoutiqueTarget` |
| Performance Hub | `hubEngine` | SalesEntry | reporting allocation (separate contract) |

**Note:** Performance Hub uses calendar **reporting allocation** (`getDailyTargetForDay`) for date-range views — operational pace targets differ by design. Monthly totals should still match when the range is a full calendar month.

## 7. Tests

`__tests__/performance-parity.test.ts`:

- Central target resolver missing vs zero
- Performance getters null achievement when missing
- `getTargetMetrics` missing-target contract
- Dashboard vs performance summary boutique target parity
- Executive monthly canonical revenue source check

Existing parity tests retained:

- `__tests__/metrics-crosspage.test.ts`
- `__tests__/targets-me-vs-metrics.test.ts`
- `__tests__/sales-imported-targets.test.ts`

## 8. Deferred (Phase 5.1+)

- Migrate `lib/sales/employeePerformanceReport.ts`, company builders, analytics payloads to central resolvers
- Align Performance Hub monthly headline with aggregator (or document permanent reporting split)
- Parity test against live PostgreSQL fixtures
- UI: employee home "No target set" when `hasMonthlyTarget === false`

## 9. Related Docs

- `SALES_SOURCE_OF_TRUTH.md` — SalesEntry read policy
- `AUDIT.md` — Phase 5 plan
- `docs/API_CANONICAL.md` — canonical API index
