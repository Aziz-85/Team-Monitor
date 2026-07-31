export type InfrastructureAppId = 'team-monitor' | 'aquamonitors' | 'echoes-library';
export type DatabaseType = 'postgresql-local' | 'postgresql-docker' | 'unknown';

export type InfrastructureAppDefinition = Readonly<{
  id: InfrastructureAppId;
  displayName: string;
  domain: string;
  cwd: string;
  port: number;
  pm2Name: string;
  runtime: 'node';
  healthCheckUrl: string;
  deploymentEnabled: boolean;
  restartEnabled: boolean;
  logsEnabled: boolean;
  databaseType: DatabaseType;
  databaseBackupEnabled: boolean;
  prismaMigrationsEnabled: boolean;
  allowedBranch: string;
}>;

function enabled(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

export const infrastructureFlags = Object.freeze({
  dashboard: enabled('INFRASTRUCTURE_DASHBOARD_ENABLED'),
  actions: enabled('INFRASTRUCTURE_ACTIONS_ENABLED'),
  deploy: enabled('INFRASTRUCTURE_DEPLOY_ENABLED'),
  restart: enabled('INFRASTRUCTURE_RESTART_ENABLED'),
  logs: enabled('INFRASTRUCTURE_LOGS_ENABLED'),
  backup: enabled('INFRASTRUCTURE_BACKUP_ENABLED'),
});

const actions = infrastructureFlags.actions;

export const INFRASTRUCTURE_APPS: readonly InfrastructureAppDefinition[] = Object.freeze([
  {
    id: 'team-monitor', displayName: 'Team Monitor', domain: 'dhtasks.com',
    cwd: '/var/www/team-monitor', port: 3002, pm2Name: 'team-monitor', runtime: 'node',
    healthCheckUrl: 'http://127.0.0.1:3002/api/health',
    deploymentEnabled: actions && infrastructureFlags.deploy,
    restartEnabled: actions && infrastructureFlags.restart,
    logsEnabled: infrastructureFlags.logs,
    databaseType: 'postgresql-local',
    databaseBackupEnabled: actions && infrastructureFlags.backup,
    prismaMigrationsEnabled: false,
    allowedBranch: 'main',
  },
  {
    id: 'aquamonitors', displayName: 'Aqua Monitors', domain: 'aquamonitors.com',
    cwd: '/var/www/aquamonitors', port: 3001, pm2Name: 'aquamonitors', runtime: 'node',
    healthCheckUrl: 'http://127.0.0.1:3001/',
    deploymentEnabled: actions && infrastructureFlags.deploy,
    restartEnabled: actions && infrastructureFlags.restart,
    logsEnabled: infrastructureFlags.logs,
    databaseType: 'postgresql-docker',
    databaseBackupEnabled: actions && infrastructureFlags.backup,
    prismaMigrationsEnabled: false,
    allowedBranch: 'main',
  },
  {
    id: 'echoes-library', displayName: 'Echoes Library', domain: 'asdaawilayahsa.com',
    cwd: '/var/www/echoes-library', port: 3000, pm2Name: 'echoes-library', runtime: 'node',
    healthCheckUrl: 'http://127.0.0.1:3000/',
    deploymentEnabled: actions && infrastructureFlags.deploy,
    restartEnabled: actions && infrastructureFlags.restart,
    logsEnabled: infrastructureFlags.logs,
    databaseType: 'unknown', databaseBackupEnabled: false, prismaMigrationsEnabled: false,
    allowedBranch: 'main',
  },
]);

export function isInfrastructureAppId(value: string): value is InfrastructureAppId {
  return INFRASTRUCTURE_APPS.some((app) => app.id === value);
}

export function getInfrastructureApp(value: string): InfrastructureAppDefinition | null {
  return INFRASTRUCTURE_APPS.find((app) => app.id === value) ?? null;
}

export function infrastructureRequestTimeoutMs(): number {
  const parsed = Number(process.env.INFRASTRUCTURE_REQUEST_TIMEOUT_MS ?? '30000');
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 300000 ? parsed : 30000;
}
