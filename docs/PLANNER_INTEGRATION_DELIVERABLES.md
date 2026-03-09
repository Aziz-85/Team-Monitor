# Microsoft Planner Integration — Implementation Deliverables

## 1. Files Changed / Created

### Prisma
- `prisma/schema.prisma` — added enums and 6 models
- `prisma/migrations/20260337000000_add_planner_integration_models/migration.sql`

### Service Layer
- `lib/integrations/planner/types.ts`
- `lib/integrations/planner/hash.ts`
- `lib/integrations/planner/normalize.ts`
- `lib/integrations/planner/permissions.ts`
- `lib/integrations/planner/mappers.ts`
- `lib/integrations/planner/graphClient.ts` (stub)
- `lib/integrations/planner/inbound.ts`
- `lib/integrations/planner/outbound.ts`
- `lib/integrations/planner/reconcile.ts`

### API Routes
- `app/api/integrations/planner/route.ts` — GET, POST
- `app/api/integrations/planner/mappings/route.ts` — GET
- `app/api/integrations/planner/mappings/users/route.ts` — POST
- `app/api/integrations/planner/mappings/buckets/route.ts` — POST
- `app/api/integrations/planner/webhook/route.ts` — POST (Power Automate)
- `app/api/integrations/planner/reconcile/route.ts` — POST
- `app/api/integrations/planner/logs/route.ts` — GET
- `app/api/integrations/planner/test/route.ts` — POST
- `app/api/integrations/planner/graph/sync/route.ts` — POST (stub)

### UI
- `app/(dashboard)/admin/integrations/planner/page.tsx`
- `app/(dashboard)/admin/integrations/planner/PlannerIntegrationClient.tsx`

### Config / i18n
- `lib/navConfig.ts` — added Planner Integration nav item
- `messages/en.json` — nav.plannerIntegration, admin.planner.*
- `messages/ar.json` — same

### Docs
- `docs/PLANNER_INTEGRATION_AUDIT.md`
- `docs/PLANNER_INTEGRATION_DELIVERABLES.md`

---

## 2. Prisma Schema Additions

### Enums
- `PlannerIntegrationMode`: GRAPH_DIRECT, POWER_AUTOMATE, MANUAL
- `PlannerSyncDirection`: IMPORT_ONLY, EXPORT_ONLY, TWO_WAY
- `PlannerTaskLinkSyncStatus`: LINKED, PENDING, ERROR, DISCONNECTED
- `PlannerSyncLogDirection`: INBOUND, OUTBOUND, RECONCILIATION
- `PlannerSyncLogStatus`: SUCCESS, ERROR, SKIPPED

### Models
- **PlannerIntegration** — config, mode, sync direction, plan id, webhook secret, status
- **PlannerTaskLink** — links Task to external Planner task
- **PlannerUserMap** — maps Microsoft user to Employee
- **PlannerBucketMap** — maps Planner bucket to local task type/zone
- **PlannerSyncLog** — audit trail
- **PlannerInboundEvent** — idempotency (eventHash unique)

---

## 3. Migration

**Name:** `20260337000000_add_planner_integration_models`

**Apply:** `npx prisma migrate deploy`

---

## 4. API Routes Summary

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| /api/integrations/planner | GET | ADMIN+ | List integrations, graph status |
| /api/integrations/planner | POST | ADMIN+ | Create/update integration |
| /api/integrations/planner/mappings | GET | ADMIN+ | User + bucket maps |
| /api/integrations/planner/mappings/users | POST | ADMIN+ | Create/update user map |
| /api/integrations/planner/mappings/buckets | POST | ADMIN+ | Create/update bucket map |
| /api/integrations/planner/webhook | POST | Secret header | Power Automate inbound |
| /api/integrations/planner/reconcile | POST | ADMIN+ | Run reconciliation |
| /api/integrations/planner/logs | GET | ADMIN+ | Paginated sync logs |
| /api/integrations/planner/test | POST | ADMIN+ | Dry-run payload parse |
| /api/integrations/planner/graph/sync | POST | ADMIN+ | Stub; returns not configured |

---

## 5. Security Notes

- Webhook requires `x-planner-webhook-secret` header matching integration webhookSecret
- All management APIs require ADMIN or SUPER_ADMIN
- No cross-boutique leakage; boutiqueId enforced
- Raw payloads not exposed in UI; logs sanitized

---

## 6. What Works Now

- Integration CRUD (create/update via API)
- User and bucket mapping CRUD
- Webhook endpoint for Power Automate (validates secret, processes idempotently)
- Reconciliation (counts linked/pending/error)
- Sync logs (paginated)
- Test endpoint (dry-run payload parsing)
- Admin UI: overview, actions, logs

---

## 7. Stubbed (Pending Graph Credentials)

- Graph Direct sync — returns "not configured" if env vars missing
- Outbound push — dry-run only; no actual Graph API calls

**Env placeholders:**
- MICROSOFT_TENANT_ID
- MICROSOFT_CLIENT_ID
- MICROSOFT_CLIENT_SECRET
- MICROSOFT_GRAPH_REDIRECT_URI (optional)

---

## 8. Example Power Automate Payload

```json
{
  "eventType": "task.created",
  "eventId": "flow-run-id-or-guid",
  "mode": "POWER_AUTOMATE",
  "integrationKey": "...",
  "planId": "...",
  "bucketId": "...",
  "taskId": "...",
  "title": "...",
  "description": "...",
  "percentComplete": 0,
  "isCompleted": false,
  "dueDateTime": "2026-03-10T00:00:00Z",
  "assignedUsers": [
    { "id": "...", "email": "user@example.com", "displayName": "User Name" }
  ],
  "sourceUpdatedAt": "2026-03-09T12:00:00Z",
  "raw": {}
}
```

---

## 9. Recommended Next Steps

1. Run `npx prisma migrate deploy` to apply migration
2. Create a PlannerIntegration via API or extend UI with connection settings form
3. Configure webhook secret and test with Power Automate
4. Add PlannerUserMap entries to map Microsoft users to local employees
5. Create PlannerTaskLink entries when linking existing tasks to Planner (or implement auto-link on first inbound)
6. When ready for Graph Direct: add MICROSOFT_* env vars and implement token fetch + plan/task fetch in graphClient
