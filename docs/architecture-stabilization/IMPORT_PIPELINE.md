# Import Pipeline

**Phase:** Architecture Stabilization Phase 4  
**Status:** Active (incremental rollout)  
**Date:** 2026-07-13

## 1. Goal

Unify Excel/CSV import behavior across sales and targets without rewriting every parser on day one.

Target stages:

```text
Upload → File Validation → Parse → Normalize → Validate
→ Dry Run / Preview → Confirm → Transaction → Audit → Result
```

Phase 4 introduces a shared facade in `lib/imports/` and wires the lowest-risk importers first.

## 2. Unified Module

| Module | Responsibility |
|---|---|
| `lib/imports/fileHash.ts` | SHA-256 fingerprint + hash compare |
| `lib/imports/validateUpload.ts` | Extension, size, MIME validation |
| `lib/imports/scopeKey.ts` | Stable scope keys for dedup |
| `lib/imports/duplicate.ts` | Fingerprint storage + legacy batch lookup |
| `lib/imports/confirm.ts` | Apply gate, duplicate block, admin reprocess |
| `lib/imports/pipeline.ts` | `runImportPreview()` orchestration |
| `lib/imports/index.ts` | Public facade |

## 3. Database: `ImportFileRecord`

Migration: `prisma/migrations/20260713120000_import_file_record/migration.sql`

Stores cross-pipeline fingerprints:

- `importType`, `scopeKey`, `fileSha256` (unique together)
- `originalFileName`, `fileSizeBytes`
- `uploadedById`, `boutiqueId`, `uploadedAt`
- `status`: `PREVIEW` | `APPLIED` | `FAILED`
- optional `batchId` / `batchEntityType`

Legacy batches remain readable for dedup:

- `SalesEntryImportBatch.fileSha256`
- `SalesLedgerBatch.fileHash`
- `KpiUpload.fileHash` (lookup only; not yet enforced)

## 4. Duplicate File Policy

On preview/dry-run:

1. Compute SHA-256 of raw bytes.
2. Lookup `ImportFileRecord` and legacy batch tables.
3. Return `duplicateFile` metadata when a prior **APPLIED** import exists.
4. Set `applyBlockedByDuplicate=true` when re-apply must be blocked.

On apply:

1. Require `fileSha256` from preview (targets) or embedded plan (yearly sales).
2. Reject with **409** when duplicate and `forceReprocess` is not set.
3. `ADMIN` / `SUPER_ADMIN` may set `forceReprocess=true` → audit log `IMPORT_FILE_REPROCESS`.

## 5. Wired Imports (Phase 4)

| Import | Preview route | Apply route | Hash dedup |
|---|---|---|---|
| Boutique targets | `/api/targets/import/boutiques/preview` | `/api/targets/import/boutiques/apply` | Yes |
| Employee targets | `/api/targets/import/employees/preview` | `/api/targets/import/employees/apply` | Yes |
| Yearly sales (new) | `/api/sales/import/yearly/dry-run` | `/api/sales/import/yearly/apply` | Yes |
| Sales ledger JSON | `/api/sales/import-ledger` | same POST | Pre-existing DB unique |
| MSR admin sales | `/api/admin/sales-import` dry-run | confirmed apply | Binding only (Phase 4.1) |

UI updates in Phase 4:

- `TargetsImportClient` sends `fileSha256` on apply and respects `applyBlockedByDuplicate`.
- `YearlySalesImportClient` respects `applyBlockedByDuplicate` in dry-run response.

## 6. Scope Keys

| Pattern | Example |
|---|---|
| Single boutique | `boutique:{boutiqueId}` |
| Multi-boutique targets | `boutiques:{sha16}` of sorted boutique IDs |

Scope keys never come from the uploaded file. They are derived server-side from authorized scope.

## 7. Deferred (Phase 4.1+)

- Matrix ledger imports (`/api/sales/import/preview`, `/api/import/monthly-matrix`)
- Matrix → SalesEntry direct (`/api/sales/import/matrix`)
- MSR admin cross-pipeline dedup beyond dry-run binding
- KPI upload preview/confirm split
- Legacy yearly route (`/api/sales/import/yearly`)
- Orphan `/api/sales/import` batch-only route
- `import-ledger` → `SalesEntry` projection (AUDIT C1)
- Post-ledger sync via `importBoutiqueSalesSyncBatch` on all matrix paths

## 8. Regression Tests

`__tests__/import-pipeline.test.ts` covers:

- SHA-256 stability
- Upload validation
- Scope key derivation
- Duplicate detection
- Apply gate / admin reprocess / missing hash

## 9. Phase 4 Verification

Run after migration + `npx prisma generate`:

```bash
npm run typecheck
npm run lint
npm test -- __tests__/import-pipeline.test.ts
npm run build
```

Full suite should remain green; new tests are additive.
