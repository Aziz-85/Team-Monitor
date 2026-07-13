# Employee Boutique Resolution — Team Monitor

**Phase:** Architecture Stabilization Phase 2  
**Status:** Active policy  
**Related:** `SALES_SOURCE_OF_TRUTH.md`, `lib/employees/resolveEmployeeBoutiqueAtDate.ts`

---

## 1. Problem

Employee boutique context was split across:

| Source | Used for |
|--------|----------|
| `Employee.boutiqueId` | Current roster (schedule, tasks, inventory) |
| `EmployeeAssignment` | Historical validation (imports only) |
| `User.boutiqueId` | Session binding |
| `UserBoutiqueMembership` | Login access |
| `UserPreference.operationalBoutiqueId` | UI picker only |

There was no single function to answer: **"Which boutique did this employee belong to on date D?"**

---

## 2. Central Service

**File:** `lib/employees/resolveEmployeeBoutiqueAtDate.ts`  
**Export:** `lib/employees/index.ts`, re-exported from `lib/sales/index.ts`

```typescript
resolveEmployeeBoutiqueAtDate({ employeeId, dateKey })
```

### Return shape

```typescript
type EmployeeBoutiqueResolution = {
  employeeId: string;
  dateKey: string;              // YYYY-MM-DD Riyadh
  currentBoutiqueId: string | null;    // Employee.boutiqueId today
  historicalBoutiqueId: string | null; // Boutique on dateKey
  historicalBoutiqueName: string | null;
  source:
    | 'EMPLOYEE_ASSIGNMENT'
    | 'CURRENT_EMPLOYEE_BOUTIQUE'
    | 'USER_BOUTIQUE'
    | 'UNRESOLVED';
  assignmentCount: number;
  active: boolean;
  isSystemOnly: boolean;
  hasUser: boolean;
  warnings: string[];
};
```

---

## 3. Resolution Priority

For **`historicalBoutiqueId`** on `dateKey`:

| Priority | Source | Condition |
|----------|--------|-----------|
| 1 | `EMPLOYEE_ASSIGNMENT` | Exactly one `EmployeeAssignment` row covers date |
| 1b | `EMPLOYEE_ASSIGNMENT` (ambiguous) | Multiple assignments, different boutiques → `historicalBoutiqueId = null` + warning |
| 2 | `CURRENT_EMPLOYEE_BOUTIQUE` | No assignment row → `Employee.boutiqueId` |
| 3 | `USER_BOUTIQUE` | `Employee.boutiqueId` empty → linked `User.boutiqueId` |
| 4 | `UNRESOLVED` | Employee not found or no boutique derivable |

**Never used for financial ownership:** `UserPreference.operationalBoutiqueId`, `UserPreference.scopeJson`

---

## 4. Distinction: Current vs Historical

| Field | Meaning | Changes when employee transfers? |
|-------|---------|----------------------------------|
| `currentBoutiqueId` | Roster membership today | Yes — follows `Employee.boutiqueId` |
| `historicalBoutiqueId` | Where employee was on `dateKey` | No — derived from assignment or fallback at query time |

**Sales ownership** uses **upload/operational boutique** (server scope), not historical employee boutique.  
Historical resolution is for **validation and warnings only**.

---

## 5. Helper Functions

| Function | Purpose |
|----------|---------|
| `resolveEmployeeBoutiqueAtDateCached(cache, empId, dateKey)` | Import loops with memoization |
| `isEmployeeAtBoutiqueOnDate(empId, boutiqueId, dateKey)` | Transaction import assignment check |
| `buildResolutionWarningsForUpload(resolution, uploadedBoutiqueId)` | Non-blocking import warnings |

---

## 6. Integration Points (Phase 2)

| Module | Change |
|--------|--------|
| `lib/sales/yearlyEmployeeSalesImport.ts` | Uses cached resolver + upload warnings |
| `lib/sales/salesOwnershipWarnings.ts` | Delegates to resolver |
| `lib/sales/employeeAssignmentAtDate.ts` | Backward-compat shim → resolver |
| `app/api/sales/import-ledger/route.ts` | `isEmployeeAtBoutiqueOnDate` |

### Not changed (by design)

| Module | Reason |
|--------|--------|
| `lib/tenancy/operationalRoster.ts` | **Current roster** SSOT remains `Employee.boutiqueId` |
| Schedule grid | Uses current roster, not historical |
| Performance Hub employee list | Current boutique scope |
| `UserPreference.operationalBoutiqueId` | UI only — unchanged |

---

## 7. Warning vs Block Policy

| Context | Policy |
|---------|--------|
| Excel / yearly import | **Warn** on boutique mismatch; sale stays on uploaded boutique |
| Manual daily line (`recordBoutiqueSale`) | **Block** if employee not in operational boutique (security) |
| Transaction import | **Warn** if `isEmployeeAtBoutiqueOnDate` false |

---

## 8. Behavior Change (Phase 2)

**Transaction import assignment check:**

- **Before:** Strict `EmployeeAssignment` row required for `assignmentVerified=true`
- **After:** `isEmployeeAtBoutiqueOnDate` uses full resolution — if no assignment but `Employee.boutiqueId` matches upload boutique, verified=true

Documented intentional alignment with assignment + current boutique fallback.

---

## 9. Test Coverage

`__tests__/employee-boutique-resolution.test.ts`:

- Employee did not transfer
- Employee transferred between branches
- Overlapping assignments
- No assignment (fallback)
- Inactive employee
- System-only employee
- Employee without User
- USER_BOUTIQUE compatibility
- Upload warning builder

---

## 10. Phase 3+ Recommendations

- Use resolver in Performance Hub when showing historical month for transferred employees
- Schedule guest coverage validation
- Target import employee boutique validation
- Replace remaining direct `employeeAssignment.findFirst` queries

---

## Appendix: Migration from legacy API

```typescript
// Old
import { resolveEmployeeAssignmentAtDate } from '@/lib/sales/employeeAssignmentAtDate';

// New (preferred)
import { resolveEmployeeBoutiqueAtDate } from '@/lib/employees';
```

`resolveEmployeeAssignmentAtDate` remains as deprecated shim for backward compatibility.
