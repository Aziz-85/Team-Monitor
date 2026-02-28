/**
 * Clear login rate limits and account lockouts so users can try logging in again.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/clear-login-rate-limit.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.authRateLimit.deleteMany({});
  console.log('Cleared', deleted.count, 'rate limit record(s).');

  const updated = await prisma.user.updateMany({
    where: { lockedUntil: { not: null } },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  if (updated.count > 0) {
    console.log('Unlocked', updated.count, 'user(s).');
  }

  console.log('You can try logging in again now.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
