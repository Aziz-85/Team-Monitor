/**
 * One-off: Create one ADMIN user per branch (Dhahran + AlRashid).
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/create-branch-admins.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BRANCHES = [
  {
    boutiqueId: 'bout_dhhrn_001',
    code: 'S05',
    name: 'Dhahran Mall',
    empId: 'admin_dhahran',
    password: 'AdminDh@123',
    displayName: 'Admin Dhahran',
  },
  {
    boutiqueId: 'bout_rashid_001',
    code: 'S02',
    name: 'AlRashid',
    empId: 'admin_rashid',
    password: 'AdminRh@123',
    displayName: 'Admin Rashid',
  },
] as const;

async function main() {
  console.log('Creating branch admin users...\n');

  for (const branch of BRANCHES) {
    const boutique = await prisma.boutique.findUnique({
      where: { id: branch.boutiqueId },
    });
    if (!boutique) {
      console.warn(`Boutique ${branch.boutiqueId} (${branch.name}) not found. Skipping.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(branch.password, 10);

    await prisma.employee.upsert({
      where: { empId: branch.empId },
      update: { boutiqueId: branch.boutiqueId, name: branch.displayName },
      create: {
        empId: branch.empId,
        name: branch.displayName,
        team: 'A',
        weeklyOffDay: 5,
        active: true,
        isSystemOnly: true,
        language: 'en',
        boutiqueId: branch.boutiqueId,
      },
    });

    const user = await prisma.user.upsert({
      where: { empId: branch.empId },
      update: { boutiqueId: branch.boutiqueId, passwordHash },
      create: {
        empId: branch.empId,
        role: 'ADMIN',
        passwordHash,
        mustChangePassword: true,
        boutiqueId: branch.boutiqueId,
      },
      select: { id: true },
    });

    await prisma.userBoutiqueMembership.upsert({
      where: {
        userId_boutiqueId: { userId: user.id, boutiqueId: branch.boutiqueId },
      },
      update: { role: 'ADMIN' },
      create: { userId: user.id, boutiqueId: branch.boutiqueId, role: 'ADMIN' },
    });

    console.log(`Created: ${branch.name} (${branch.code}) → ${branch.empId}`);
  }

  console.log('\n--- بيانات الدخول (Credentials) ---\n');
  console.log('فرع الظهران (Dhahran Mall):');
  console.log('  اسم المستخدم (Username): admin_dhahran');
  console.log('  كلمة المرور (Password):  AdminDh@123\n');
  console.log('فرع الراشد (AlRashid):');
  console.log('  اسم المستخدم (Username): admin_rashid');
  console.log('  كلمة المرور (Password):  AdminRh@123\n');
  console.log('يُنصح بتغيير كلمة المرور بعد أول دخول.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
