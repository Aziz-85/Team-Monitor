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
});
