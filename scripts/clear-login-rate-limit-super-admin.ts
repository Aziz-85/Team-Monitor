/**
 * Clear login rate limit for super_admin so they can log in again.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/clear-login-rate-limit-super-admin.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emailKey = 'email:super_admin';
  const deleted = await prisma.authRateLimit.deleteMany({
    where: { key: emailKey },
  });
  if (deleted.count > 0) {
    console.log('✅ Cleared login rate limit for super_admin. You can log in now.');
  } else {
    console.log('ℹ️ No rate limit record found for super_admin. You can try logging in.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
