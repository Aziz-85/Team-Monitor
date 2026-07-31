import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getInfrastructureApp } from '@/config/infrastructure/apps';
import { InfrastructureAppClient } from './InfrastructureAppClient';

export default async function InfrastructureAppPage({ params }: { params: { appId: string } }) {
  const user = await getSessionUser(); if (!user) redirect('/login'); if (user.role !== 'SUPER_ADMIN') redirect('/');
  const app = getInfrastructureApp(params.appId); if (!app) notFound();
  return <InfrastructureAppClient app={{ id: app.id, displayName: app.displayName, domain: app.domain, port: app.port, features: { restart: app.restartEnabled, deploy: app.deploymentEnabled, backup: app.databaseBackupEnabled, logs: app.logsEnabled } }} />;
}
