import fs from 'fs';
import path from 'path';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import packageJson from '../../../../package.json';
import { CompanyGovernanceClient } from './CompanyGovernanceClient';

function readBuildIdSafe(): string | null {
  try {
    const p = path.join(process.cwd(), '.next', 'BUILD_ID');
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8').trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default async function CompanyGovernancePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const [boutiqueCount, employeeCount] = await Promise.all([
    prisma.boutique.count({ where: { isActive: true } }),
    prisma.employee.count({
      where: { active: true, isSystemOnly: false },
    }),
  ]);

  const buildId = readBuildIdSafe();

  return (
    <CompanyGovernanceClient
      boutiqueCount={boutiqueCount}
      employeeCount={employeeCount}
      appVersion={packageJson.version}
      buildId={buildId}
    />
  );
}
