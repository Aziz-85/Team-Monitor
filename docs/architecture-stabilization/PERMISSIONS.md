# Permissions and Boutique Isolation

**Phase:** Architecture Stabilization Phase 3  
**Status:** Active server policy  
**Date:** 2026-07-13

## 1. Trust Boundary

The following values are never authority:

- `boutiqueId` in JSON, FormData, query strings, hidden inputs, or Excel metadata
- `userId` or `role` supplied by a browser
- import batch IDs, target IDs, attachment IDs, or other URL identifiers
- `UserPreference.operationalBoutiqueId` for financial ownership

Authority comes from:

1. Valid server session (`Session` + enabled `User`)
2. Effective role from server-side access context
3. Active `Boutique`
4. `UserBoutiqueMembership.canAccess`
5. Required membership permission flag
6. Resource's persisted `boutiqueId`

## 2. Unified Layers

| Layer | Location | Responsibilities |
|---|---|---|
| Authentication | `lib/auth/index.ts` | `requireAuthenticatedUser`, `requireMutableUser`, role checks |
| Boutique authorization | `lib/permissions/boutiqueAccess.ts` | Access and permission decisions |
| Resource authorization | `lib/permissions/resourceAccess.ts` | IDOR-safe batch/resource lookup |
| Permission facade | `lib/permissions/index.ts` | Stable exports |
| Read/write scope | `lib/scope/index.ts` | `resolveReadScope`, `resolveWriteScope` |
| Existing scope SSOT | `lib/scope/ssot.ts` | Operational/global scope resolution |

Recommended route flow:

```text
Authenticate
→ Resolve server scope
→ Validate persisted resource boutique
→ Check permission flag
→ Validate payload
→ Call domain service
→ Audit
→ Respond
```

## 3. Role Policy

| Role | Read scope | Write scope |
|---|---|---|
| EMPLOYEE | Own/assigned boutique and own records where applicable | Explicit employee operations only |
| ASSISTANT_MANAGER | Assigned boutique; module-specific | No sales import/target management unless explicitly delegated |
| MANAGER | Operational boutique with access | Membership flag required (`canManage*`) |
| AREA_MANAGER | Membership boutiques with `canAccess=true` | Membership flag required per boutique |
| ADMIN | Active boutiques, explicitly resolved | Platform access is explicit; sensitive actions audited |
| SUPER_ADMIN | Active boutiques / explicit context | Platform access is explicit; sensitive actions audited |
| Platform Owner | Depends on active platform/branch mode | Explicit platform access; no client-derived role |
| DEMO_VIEWER | Read only | Always rejected by `requireMutableUser`; middleware remains defense in depth |

## 4. Boutique Access Rules

`checkBoutiqueAccess(user, boutiqueId)`:

1. Reject disabled users.
2. Reject missing/inactive boutiques.
3. Platform Owner, SUPER_ADMIN, and ADMIN have explicit platform access.
4. Other users require `UserBoutiqueMembership.canAccess=true`.
5. Legacy compatibility permits the exact session `User.boutiqueId` only when no membership row exists.
6. An existing membership with `canAccess=false` always denies access.

`checkBoutiquePermission(user, boutiqueId, permission)` additionally requires:

- `MANAGER` or `AREA_MANAGER`
- membership `canAccess=true`
- the requested `canManageTasks`, `canManageLeaves`, `canManageSales`, or `canManageInventory` flag

## 5. Sales Permission Change

Before Phase 3, a MANAGER whose requested boutique matched the trusted operational boutique could manage sales even when `canManageSales=false`.

After Phase 3:

```text
trusted operational boutique match
AND membership canAccess=true
AND membership canManageSales=true
```

This is an intentional security fix.

## 6. Resource IDOR Rules

### SalesEntry import batches

Batch access is resolved using persisted `SalesEntryImportBatchLine.boutiqueId` values, not the URL batch ID.

- Listing is filtered to authorized boutique IDs.
- Rollback preview requires boutique access and sales management permission.
- Rollback execution requires the same checks plus `requireMutableUser`.

### Compliance attachments

- Item is loaded from DB.
- `ComplianceItem.boutiqueId` must exist in operational scope.
- Central boutique access check must pass.
- Upload/delete writes an immutable `AuditLog`.

### Employee targets

- Target is loaded from DB before authorization.
- `EmployeeMonthlyTarget.boutiqueId` must be in target scope.
- Update/delete creates `TargetChangeAudit`.

## 7. DEMO_VIEWER

`DEMO_VIEWER` is read-only:

- No POST, PUT, PATCH, DELETE business operations
- No import, approval, deletion, target changes, or user administration
- `middleware.ts` blocks mutations globally
- `requireMutableUser()` enforces the same policy inside sensitive routes

## 8. Audit Requirements

| Operation | Audit |
|---|---|
| Sales ledger write/import | `SalesLedgerAudit` / import batch audit |
| Target update/delete | `TargetChangeAudit` |
| Compliance attachment upload/delete | `AuditLog` (`module=COMPLIANCE`) |
| Import rollback | Existing SalesEntry import rollback audit/batch state |
| Global executive access | Admin audit |

## 9. Regression Tests

| Test | Coverage |
|---|---|
| `boutique-access-security.test.ts` | Cross-boutique access, changed boutique ID, disabled user, inactive boutique, membership denial |
| `auth-mutation-security.test.ts` | DEMO_VIEWER mutation rejection |
| `sales-ledger.test.ts` | MANAGER `canManageSales` enforcement |
| Existing `ssot-scope.test.ts` | Operational/global scope behavior |
| Existing `area-manager.test.ts` | Assigned boutique target scope |

## 10. Known Compatibility

- Legacy users without a membership row may access only their exact session boutique.
- A `canAccess=false` membership always overrides that fallback.
- No database migration is required for Phase 3.
- Existing role and membership records are unchanged.

## 11. Deferred Work

- Migrate every remaining route to the facades incrementally.
- Add PostgreSQL-backed integration tests for route handlers.
- Consolidate effective role/delegation checks under the same facade.
- Add CSRF enforcement review for all cookie-authenticated mutations.

## 12. Phase 3 Verification

| Gate | Result |
|---|---|
| `npm install` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with 3 pre-existing React Hook warnings |
| `npm test` | Passed — 77 suites, 519 tests |
| `npm run build` | Passed |
| `npm run security:audit` | Failed — 17 dependency advisories |

The audit blocker is not caused by Phase 3 code. It includes a critical
`handlebars` advisory, high-severity Next.js advisories, and `xlsx` advisories
with no registry fix. npm proposes breaking major changes for several remaining
items. No `--force` dependency upgrade was applied in this stabilization phase.
