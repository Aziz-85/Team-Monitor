describe('infrastructure application registry', () => {
  const original = process.env;
  afterEach(() => { process.env = original; jest.resetModules(); });

  test('uses a fixed allowlist and rejects unknown app IDs', async () => {
    const registry = await import('@/config/infrastructure/apps');
    expect(registry.INFRASTRUCTURE_APPS.map((app) => app.id)).toEqual(['team-monitor', 'aquamonitors', 'echoes-library']);
    expect(registry.getInfrastructureApp('../../etc/passwd')).toBeNull();
    expect(registry.isInfrastructureAppId('arbitrary-command')).toBe(false);
  });

  test('all execution features are disabled by default', async () => {
    process.env = { ...original };
    for (const key of ['INFRASTRUCTURE_ACTIONS_ENABLED', 'INFRASTRUCTURE_DEPLOY_ENABLED', 'INFRASTRUCTURE_RESTART_ENABLED', 'INFRASTRUCTURE_LOGS_ENABLED', 'INFRASTRUCTURE_BACKUP_ENABLED']) delete process.env[key];
    jest.resetModules(); const registry = await import('@/config/infrastructure/apps');
    expect(registry.infrastructureFlags.actions).toBe(false);
    for (const app of registry.INFRASTRUCTURE_APPS) expect([app.deploymentEnabled, app.restartEnabled, app.logsEnabled, app.databaseBackupEnabled].some(Boolean)).toBe(false);
  });

  test('sensitive app properties cannot be supplied by request data', async () => {
    const registry = await import('@/config/infrastructure/apps');
    const app = registry.getInfrastructureApp('team-monitor');
    expect(app?.cwd).toBe('/var/www/team-monitor'); expect(app).not.toHaveProperty('command');
  });

  test('Echoes Library uses its non-redirecting health endpoint', async () => {
    const registry = await import('@/config/infrastructure/apps');
    const app = registry.getInfrastructureApp('echoes-library');
    expect(app?.healthCheckUrl).toBe('http://127.0.0.1:3000/api/health');
  });
});
