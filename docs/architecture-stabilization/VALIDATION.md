# Zod Validation Layer

**Phase:** Architecture Stabilization Phase 6  
**Status:** Active (incremental rollout)  
**Date:** 2026-07-13

## 1. Goal

Replace ad-hoc request parsing with shared **Zod** schemas for high-risk API routes. User-facing errors are single `{ error: string }` messages — no stack traces or raw Zod issue dumps.

## 2. Module Layout

| Path | Role |
|---|---|
| `lib/validation/index.ts` | Public facade |
| `lib/validation/zodError.ts` | `formatZodError`, `parseJsonBody`, `parseApplyPlanFromFormData` |
| `lib/validation/primitives.ts` | Reusable fields: `monthKey`, `empId`, `fileSha256`, roles |
| `lib/validation/schemas/users.ts` | Admin user create / patch / delete |
| `lib/validation/schemas/targetsImport.ts` | Boutique & employee apply-plan schemas (scope-aware) |
| `lib/validation/schemas/salesImport.ts` | Yearly sales apply plan, import-ledger body |
| `lib/validation/schemas/importCommon.ts` | Shared import apply form metadata |

## 3. Error Contract

```typescript
// Success path
const parsed = await parseJsonBody(request, userCreateSchema);
if (!parsed.ok) return parsed.response; // NextResponse 400

// Response shape
{ "error": "role: Invalid enum value. Expected 'EMPLOYEE' | ..." }
```

`formatZodError()` returns the first issue as `path: message`.

## 4. Scope-Aware Import Plans

Target apply plans use **schema factories** so IDOR protection stays in validation:

```typescript
boutiqueApplyPlanSchema(allowedBoutiqueIds)
employeeApplyPlanSchema(allowedBoutiqueIds)
yearlySalesApplyPlanSchema(expectedBoutiqueId)
```

Legacy parsers (`parseBoutiqueApplyPlan`, etc.) delegate to the same Zod schemas.

## 5. Wired Routes (Phase 6)

| Route | Schema |
|---|---|
| `POST /api/targets/import/boutiques/apply` | `boutiqueApplyPlanSchema` + FormData helpers |
| `POST /api/targets/import/employees/apply` | `employeeApplyPlanSchema` |
| `POST /api/sales/import/yearly/apply` | `yearlySalesApplyPlanSchema` |
| `POST /api/sales/import-ledger` | `importLedgerBodySchema` |
| `POST /api/admin/users` | `userCreateSchema` (+ password policy after parse) |
| `PATCH /api/admin/users` | `userPatchSchema` |
| `DELETE /api/admin/users` | `userDeleteQuerySchema` |

File upload validation (`validateImportUpload`) remains in `lib/imports/` — Zod validates JSON/text fields only.

## 6. Preserved Helpers

Existing domain parsers are **wrapped**, not replaced, where they encode business rules:

- `normalizeMonthKey` — used via `monthKeySchema` transform
- `validatePasswordStrength` — runs after `userCreateSchema` (policy stays centralized)
- `validateImportUpload` — binary file checks unchanged

## 7. Tests

`__tests__/validation.test.ts` — schema contracts, scope enforcement, JSON error mapping.

## 8. Deferred (Phase 6.1+)

- `POST /api/admin/employees` — employee CRUD enums/ranges
- Matrix / MSR import routes
- KPI upload payloads
- Query-param schemas for list/filter endpoints
- Optional `fieldErrors` map for form UIs (currently single `error` string)

## 9. Related Docs

- `IMPORT_PIPELINE.md` — import apply flow
- `PERMISSIONS.md` — admin route access
- `AUDIT.md` — Phase 6 plan (H4 finding)
