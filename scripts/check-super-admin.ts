/**
 * Check super_admin user and verify password. Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-super-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const empId = 'super_admin';
  const password = 'SuperAdmin@123';

  const user = await prisma.user.findUnique({
    where: { empId },
    include: { boutique: { select: { id: true, name: true, code: true } } },
  });

  if (!user) {
    console.log('❌ User super_admin NOT FOUND in database.');
    return;
  }

  console.log('✅ User found:', {
    id: user.id,
    empId: user.empId,
    role: user.role,
    disabled: user.disabled,
    boutiqueId: user.boutiqueId,
    boutique: user.boutique?.name ?? null,
    lockedUntil: user.lockedUntil,
    mustChangePassword: user.mustChangePassword,
  });

  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log('Password check (SuperAdmin@123):', ok ? '✅ MATCH' : '❌ NO MATCH');

  if (!ok) {
    // Re-hash and show what we'd get
    const newHash = await bcrypt.hash(password, 10);
    console.log('To fix, update User in DB: set passwordHash to new hash, or run: npx prisma db seed');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
