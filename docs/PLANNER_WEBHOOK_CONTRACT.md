# Power Automate Webhook Contract

## Endpoint

- **URL**: `POST https://<your-domain>/api/integrations/planner/webhook`
- **Header**: `x-planner-webhook-secret` = integration webhookSecret (required)
- **Content-Type**: `application/json`

## Payload Shape

### Required

| Field     | Type   | Description                          |
|----------|--------|--------------------------------------|
| taskId   | string | External Planner task ID. Also accepted in `raw.taskId` |

### Optional (recommended)

| Field          | Type    | Description                                      |
|----------------|---------|--------------------------------------------------|
| eventType      | string  | e.g. `task.created`, `task.updated`, `task.completed`, `task.uncompleted` |
| eventId        | string  | Flow run ID; full payload hash used for idempotency |
| planId         | string  | Planner plan ID                                  |
| bucketId       | string  | Planner bucket ID                                |
| title          | string  | Task title                                       |
| description    | string  | Task description                                 |
| isCompleted    | boolean | true = mark complete (used for sync)             |
| percentComplete| number  | 100 = completed                                  |
| dueDateTime    | string  | ISO 8601 date                                    |
| assignedUsers  | array   | `[{ email?, displayName?, id? }]` — first email used for assignee mapping |
| sourceUpdatedAt| string  | ISO 8601 timestamp                               |
| raw            | object  | Fallback for nested fields                       |

## Response

```json
{
  "ok": true,
  "processed": true,
  "created": 0,
  "updated": 1,
  "skipped": 0,
  "errors": []
}
```

- `processed`: Whether event was processed (false = duplicate, idempotent skip)
- `created`: Tasks created (currently 0; completion sync only)
- `updated`: Task completions applied
- `skipped`: Events skipped (no link, unmapped user, etc.)
- `errors`: Non-fatal messages (e.g. "No linked task for externalTaskId")

## Fallback Behavior

| Scenario           | Behavior                                                |
|--------------------|---------------------------------------------------------|
| Unmapped user      | Skipped; no TaskCompletion created; log status SKIPPED |
| Unmapped bucket    | Not used for completion; bucket maps for future use     |
| Missing optional   | Normalized to null/empty; processing continues         |
| No PlannerTaskLink | Skipped; error "No linked task for externalTaskId"      |
| Duplicate payload  | Idempotent; returns skipped: 1                          |
