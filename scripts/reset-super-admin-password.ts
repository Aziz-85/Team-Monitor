/**
 * Reset super_admin password to SuperAdmin@123.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reset-super-admin-password.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = 'SuperAdmin@123';
  const hash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.updateMany({
    where: { empId: 'super_admin' },
    data: { passwordHash: hash, mustChangePassword: true },
  });

  if (updated.count === 0) {
    console.log('❌ No user with empId super_admin found.');
    return;
  }

  console.log('✅ super_admin password reset to: SuperAdmin@123');
  console.log('   mustChangePassword set to true. You can log in now.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
