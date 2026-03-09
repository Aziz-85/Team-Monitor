# Microsoft Planner — POWER_AUTOMATE Mode Rollout Checklist

## Pre-activation

- [ ] **Migration applied**: `npx prisma migrate deploy`
- [ ] **Environment**: No Graph env vars required for POWER_AUTOMATE (MICROSOFT_* optional)
- [ ] **Create integration** via API or admin UI:
  - POST `/api/integrations/planner` with `{ mode: "POWER_AUTOMATE", enabled: true, webhookSecret: "<strong-random>", boutiqueId: "<id>" }`
- [ ] **User mappings**: Add PlannerUserMap entries (Microsoft email → Employee empId) via admin UI
- [ ] **Bucket mappings** (optional): Add PlannerBucketMap for Planner bucket → local task type/zone
- [ ] **Task links**: Ensure local tasks are linked to external Planner tasks (PlannerTaskLink) — via sync/planner or manual linking

## Power Automate flow

- [ ] **Webhook URL**: `https://<your-domain>/api/integrations/planner/webhook`
- [ ] **Header**: `x-planner-webhook-secret` = integration webhookSecret
- [ ] **Payload**: JSON with `taskId`, `eventType`, `assignedUsers`, `isCompleted`, etc. (see PLANNER_INTEGRATION_DELIVERABLES.md)
- [ ] **Test**: Use admin page "Test payload helper" to validate payload shape before connecting flow

## Post-activation verification

- [ ] **Webhook test**: Send a test payload from Power Automate; check logs in admin page
- [ ] **Idempotency**: Send same payload twice; second should return `skipped: 1`
- [ ] **Completion sync**: Mark task complete in Planner; verify local TaskCompletion created
- [ ] **Logs**: Admin → Planner Integration → Sync logs shows INBOUND entries with direction, eventType, status, local/external task IDs

## Security

- [ ] **RBAC**: Only ADMIN/SUPER_ADMIN can access `/admin/integrations/planner` and all `/api/integrations/planner/*` (except webhook)
- [ ] **Boutique scope**: ADMIN sees only their boutique's integrations/mappings; SUPER_ADMIN sees all
- [ ] **Webhook auth**: Requests without valid `x-planner-webhook-secret` return 401

## Rollback

- Set integration `enabled: false` via API to stop processing webhook payloads
- No schema rollback needed; data preserved
