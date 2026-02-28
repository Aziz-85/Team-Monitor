/**
 * Deactivate emp_rashid_1 and emp_rashid_2 (sample AlRashid employees).
 * Run: node scripts/deactivate-rashid-sample-employees.js
 * Loads .env from project root.
 */
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EMP_IDS = ['emp_rashid_1', 'emp_rashid_2'];

async function deactivateCascade(empId) {
  const UNASSIGNED = 'UNASSIGNED';
  await prisma.$transaction(async (tx) => {
    await tx.taskPlan.updateMany({ where: { primaryEmpId: empId }, data: { primaryEmpId: UNASSIGNED } });
    await tx.taskPlan.updateMany({ where: { backup1EmpId: empId }, data: { backup1EmpId: UNASSIGNED } });
    await tx.taskPlan.updateMany({ where: { backup2EmpId: empId }, data: { backup2EmpId: UNASSIGNED } });
    await tx.shiftOverride.deleteMany({ where: { empId } });
    await tx.inventoryRotationMember.deleteMany({ where: { empId } });
    await tx.inventoryZoneAssignment.updateMany({ where: { empId }, data: { active: false } });
    await tx.inventoryDailyWaitingQueue.deleteMany({ where: { empId } });
  });
}

async function main() {
  for (const empId of EMP_IDS) {
    const emp = await prisma.employee.findUnique({ where: { empId }, select: { empId: true, name: true, active: true } });
    if (!emp) {
      console.log('Skip (not found):', empId);
      continue;
    }
    if (!emp.active) {
      console.log('Already inactive:', empId, emp.name);
      continue;
    }
    await deactivateCascade(empId);
    await prisma.user.updateMany({ where: { empId }, data: { disabled: true } });
    await prisma.employee.update({ where: { empId }, data: { active: false } });
    console.log('Deactivated:', empId, emp.name);
  }
  console.log('Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
