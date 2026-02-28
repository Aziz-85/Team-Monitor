/**
 * List employees by boutique (Dhahran vs AlRashid).
 * Run: node scripts/list-employees-by-boutique.js
 * Loads .env from project root so DATABASE_URL is set (same as the app on the server).
 */
const path = require('path');
const fs = require('fs');

// Load .env from project root (no dotenv dependency)
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

async function main() {
  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });

  for (const b of boutiques) {
    const employees = await prisma.employee.findMany({
      where: { boutiqueId: b.id, active: true },
      orderBy: [{ name: 'asc' }],
      select: {
        empId: true,
        name: true,
        position: true,
        team: true,
        isSystemOnly: true,
        user: { select: { role: true } },
      },
    });
    const label = `${b.name} (${b.code})`;
    console.log('\n' + '='.repeat(60));
    console.log('  ' + label);
    console.log('='.repeat(60));
    if (employees.length === 0) {
      console.log('  (no employees)');
      continue;
    }
    for (const e of employees) {
      const role = (e.user && e.user.role) ? e.user.role : '—';
      const sys = e.isSystemOnly ? ' [system]' : '';
      const pos = e.position != null ? e.position : '—';
      console.log(`  ${String(e.empId).padEnd(20)} ${String(e.name).padEnd(28)} ${String(pos).padEnd(18)} team ${e.team}   role: ${role}${sys}`);
    }
    console.log(`  Total: ${employees.length}`);
  }
  console.log('\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
