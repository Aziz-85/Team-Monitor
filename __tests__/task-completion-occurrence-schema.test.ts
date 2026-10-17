import fs from 'fs';
import path from 'path';

describe('TaskCompletion occurrence identity', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20261015000000_task_completion_occurrences/migration.sql'
    ),
    'utf8'
  );
  const launchPolicyMigration = fs.readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20261015010000_task_tracking_launch_policy/migration.sql'
    ),
    'utf8'
  );
  const taskListRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/tasks/list/route.ts'),
    'utf8'
  );
  const taskMonitorRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/tasks/monitor/route.ts'),
    'utf8'
  );

  it('keeps dueDate in the model and unique occurrence key', () => {
    const model = schema.match(/model TaskCompletion \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(model).toContain('dueDate     DateTime @db.Date');
    expect(model).toContain('@@unique([taskId, userId, dueDate])');
  });

  it('backfills legacy rows before making dueDate required', () => {
    expect(migration).toContain('UPDATE "TaskCompletion"');
    expect(migration).toContain('AT TIME ZONE \'Asia/Riyadh\'');
    expect(migration).toContain('ALTER COLUMN "dueDate" SET NOT NULL');
    expect(migration).toContain('"TaskCompletion_taskId_userId_dueDate_key"');
  });

  it('starts fair scoring on the production migration date', () => {
    expect(launchPolicyMigration).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh'");
    expect(launchPolicyMigration).toContain("'TASK_TRACKING_LAUNCH_DATE'");
    expect(launchPolicyMigration).toContain('ON CONFLICT ("key") DO NOTHING');
  });

  it('excludes pre-launch occurrences from task lists and performance monitoring', () => {
    expect(taskListRoute).toContain('day >= launchDate');
    expect(taskMonitorRoute).toContain('day >= launchDate');
    expect(taskListRoute).toContain('launchDate');
    expect(taskMonitorRoute).toContain('launchDate');
  });
});
