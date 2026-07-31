import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { InfrastructureDashboardClient } from './InfrastructureDashboardClient';

export default async function InfrastructurePage() {
  const user = await getSessionUser(); if (!user) redirect('/login'); if (user.role !== 'SUPER_ADMIN') redirect('/');
  return <InfrastructureDashboardClient />;
}
