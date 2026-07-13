/** Gate integration tests behind an explicit env flag or DATABASE_URL. */
export function integrationTestsEnabled(): boolean {
  return (
    process.env.RUN_INTEGRATION_TESTS === '1' ||
    process.env.INTEGRATION_DATABASE_URL != null ||
    (process.env.CI === 'true' && process.env.DATABASE_URL != null)
  );
}

export function integrationDatabaseUrl(): string | null {
  return (
    process.env.INTEGRATION_DATABASE_URL ??
    (process.env.RUN_INTEGRATION_TESTS === '1' ? process.env.DATABASE_URL ?? null : null)
  );
}
