import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { YearlySalesImportClient } from './YearlySalesImportClient';
import type { Role } from '@prisma/client';

const ALLOWED: Role[] = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'];

export default async function SalesImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!ALLOWED.includes(user.role as Role)) redirect('/');

  return <YearlySalesImportClient />;
}
