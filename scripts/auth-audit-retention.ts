/**
 * Auth Audit Log retention script.
 * Deletes AuthAuditLog entries older than 180 days.
 *
 * DO NOT AUTO-RUN. Schedule via cron or run manually:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/auth-audit-retention.ts
 *
 * Optional: AUTH_AUDIT_RETENTION_DAYS=90 to override (default 180).
 */

import { PrismaClient } from '@prisma/client';

const RETENTION_DAYS = parseInt(process.env.AUTH_AUDIT_RETENTION_DAYS ?? '180', 10) || 180;

async function main() {
  const prisma = new PrismaClient();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  const result = await prisma.authAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  console.log(`Deleted ${result.count} AuthAuditLog entries older than ${RETENTION_DAYS} days (before ${cutoff.toISOString()})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
