INSERT INTO "SystemConfig" ("id", "key", "valueJson")
VALUES (
  'task_tracking_launch_policy',
  'TASK_TRACKING_LAUNCH_DATE',
  to_json(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date)::text)::text
)
ON CONFLICT ("key") DO NOTHING;
