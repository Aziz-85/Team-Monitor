import { NextResponse } from 'next/server';
import { INFRASTRUCTURE_APPS, infrastructureFlags } from '@/config/infrastructure/apps';
import { requireInfrastructureAdmin } from '@/lib/infrastructure/authorization';
import { callInfrastructureAgent, InfrastructureAgentError } from '@/lib/infrastructure/agentClient';

export async function GET() {
  try { await requireInfrastructureAdmin(); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  if (!infrastructureFlags.dashboard) return NextResponse.json({ enabled: false, agentStatus: 'disabled', apps: [] });
  try {
    const [system, ...results] = await Promise.all([
      callInfrastructureAgent('/v1/system/status'),
      ...INFRASTRUCTURE_APPS.flatMap((app) => [
        callInfrastructureAgent(`/v1/apps/${app.id}/status`).catch(() => ({ status: 'unknown' })),
        callInfrastructureAgent(`/v1/apps/${app.id}/health`).catch(() => ({ status: 'unknown' })),
      ]),
    ]);
    const apps = INFRASTRUCTURE_APPS.map((app, index) => ({
      id: app.id, displayName: app.displayName, domain: app.domain, port: app.port,
      features: { deploy: app.deploymentEnabled, restart: app.restartEnabled, logs: app.logsEnabled, backup: app.databaseBackupEnabled },
      process: results[index * 2], health: results[index * 2 + 1], checkedAt: new Date().toISOString(),
    }));
    return NextResponse.json({ enabled: true, agentStatus: 'healthy', system, apps });
  } catch (error) {
    const code = error instanceof InfrastructureAgentError ? error.code : 'UNAVAILABLE';
    return NextResponse.json({ enabled: true, agentStatus: 'unknown', error: code, apps: INFRASTRUCTURE_APPS.map((app) => ({ id: app.id, displayName: app.displayName, domain: app.domain, port: app.port, health: { status: 'unknown' } })) });
  }
}
