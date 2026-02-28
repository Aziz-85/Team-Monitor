# Phase 1: Multi-Boutique Foundation (DB First)

**Constraints:** No destructive migrations, production stable, no schedule logic changes. Site source of truth. Asia/Riyadh, week starts Saturday.

## Summary

- **TASK A:** Added Prisma models: `Organization`, `Region`, `Boutique`, `BoutiqueGroup`, `BoutiqueGroupMember`, `UserBoutiqueMembership`, `SystemConfig`.
- **TASK B:** Added nullable `boutiqueId` to all operational tables listed below; indexes on `boutiqueId` created in migration 1.
- **TASK C:** Seed + backfill (idempotent): Organization KOOHEJI, Region EASTERN, Boutique S05 "Dhahran Mall", `DEFAULT_BOUTIQUE_ID` in SystemConfig, UserBoutiqueMembership per user, backfill all operational rows with default boutique.
- **TASK D:** Second migration backfills and enforces `boutiqueId` NOT NULL on all operational tables.

## Tables updated with `boutiqueId`

| Table | Notes |
|-------|--------|
| ScheduleEditAudit | schedule audits |
| ShiftOverride | schedule overrides |
| CoverageRule | coverage rules |
| ScheduleLock | day/week locks |
| ScheduleWeekStatus | week status (draft/approved) |
| Task | tasks |
| PlannerImportBatch | planner import batches |
| PlannerImportRow | planner import rows + flags |
| AuditLog | audit log |
| ApprovalRequest | approval requests |
| InventoryRotationConfig | daily inventory config |
| InventoryDailyRun | daily run per date |
| InventoryZone | zones |
| BoutiqueMonthlyTarget | sales targets |
| EmployeeMonthlyTarget | employee monthly targets |
| SalesTargetAudit | sales target audit |
| SalesEntry | daily sales entries |
| SalesEditGrant | sales edit grants |

## Deployment

1. **Apply migrations (both run in order):**
   ```bash
   npx prisma migrate deploy
   ```
   - Migration 1: creates foundation tables and adds nullable `boutiqueId` + indexes.
   - Migration 2: seeds default org/region/boutique, SystemConfig, UserBoutiqueMembership, backfills all `boutiqueId` where null, then sets NOT NULL.

2. **Optional (if not using migration 2 backfill):** Run seed to create default boutique and backfill:
   ```bash
   npm run db:seed
   ```
   Then run the second migration if it was not applied yet.

3. **Standalone backfill script (optional):**
   ```bash
   npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/backfill-boutique-foundation.ts
   ```
   Use when you want to run only the multi-boutique seed + backfill without full seed.

## Default boutique

- **ID:** `bout_dhhrn_001` (fixed so migration and seed agree).
- **Code:** S05  
- **Name:** Dhahran Mall  
- **SystemConfig key:** `DEFAULT_BOUTIQUE_ID` (valueJson = `"bout_dhhrn_001"`).

## Schema (excerpt)

- `Organization` → `Region` → `Boutique` (Boutique.regionId optional).
- `BoutiqueGroup` ↔ `BoutiqueGroupMember` ↔ `Boutique`.
- `UserBoutiqueMembership`: userId, boutiqueId, role (unique per user+boutique).
- `SystemConfig`: key (unique), valueJson.

All operational tables above have `boutiqueId` (after migration 2: NOT NULL). No FKs from these tables to Boutique in Phase 1 (optional later).
