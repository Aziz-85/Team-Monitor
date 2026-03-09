# Microsoft Planner — POWER_AUTOMATE Production Rollout

## Exact Production Rollout Steps

1. **Apply migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Create integration** (Admin → Planner Integration)
   - Click "Add Power Automate integration" if none exists
   - Select boutique, set webhook secret (strong random string), optional plan name
   - Or via API: `POST /api/integrations/planner` with `{ mode: "POWER_AUTOMATE", enabled: true, webhookSecret: "<secret>", boutiqueId: "<id>" }`

3. **Add user mappings** (Admin → Planner Integration → User mappings)
   - Map each Microsoft email to Employee (empId) for assignees
   - Unmapped users: events skipped; no TaskCompletion created

4. **Add bucket mappings** (optional)
   - Map Planner bucket IDs to local task type/zone for future use
   - Unmapped buckets: not used for completion sync

5. **Link tasks** (Sync Planner or manual)
   - Ensure PlannerTaskLink exists for externalTaskId ↔ localTaskId
   - No link → event skipped with "No linked task for externalTaskId"

6. **Configure Power Automate**
   - Webhook URL: `https://<your-domain>/api/integrations/planner/webhook`
   - Header: `x-planner-webhook-secret` = integration webhookSecret
   - Body: JSON with required `taskId`, optional `eventType`, `assignedUsers`, `isCompleted`, etc.
   - See `docs/PLANNER_WEBHOOK_CONTRACT.md` for full payload shape

7. **Test**
   - Use admin "Test payload helper" with sample payloads (task.created, task.completed, etc.)
   - Send real payload from Power Automate; check Sync logs for eventType, status, taskId, localTaskId, message

8. **Verify**
   - Idempotency: same payload twice → second returns `skipped: 1`
   - Completion: mark task complete in Planner → local TaskCompletion created (when user mapped + task linked)

## Pre-activation Checklist

- [ ] Migration applied
- [ ] Integration created (POWER_AUTOMATE, enabled, webhookSecret)
- [ ] User mappings added for assignees
- [ ] Task links exist (sync/planner)
- [ ] Power Automate flow configured with correct URL + header

## Post-activation Verification

- [ ] Webhook test from Power Automate; logs show INBOUND
- [ ] Idempotency: duplicate payload → skipped
- [ ] Completion sync works for mapped user + linked task

## Fallback Behavior

| Scenario        | Result                                      |
|-----------------|---------------------------------------------|
| Unmapped user   | Skipped; no TaskCompletion                 |
| Unmapped bucket | Not used; completion sync continues        |
| Missing optional| Normalized to null; processing continues    |
| No task link    | Skipped; "No linked task for externalTaskId" |

## Security

- **RBAC**: ADMIN, SUPER_ADMIN, AREA_MANAGER for admin page and APIs (except webhook)
- **Boutique scope**: ADMIN/AREA_MANAGER see only their boutiques
- **Webhook**: Valid `x-planner-webhook-secret` required; 401 otherwise

## Rollback

- Set integration `enabled: false` via API
- No schema rollback; data preserved
