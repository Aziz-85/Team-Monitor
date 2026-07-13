/**
 * PostgreSQL integration tests — skipped unless RUN_INTEGRATION_TESTS=1.
 *
 * Local:
 *   docker compose -f docker-compose.test.yml up -d
 *   RUN_INTEGRATION_TESTS=1 DATABASE_URL=postgresql://... npm run test:integration
 */

import { PrismaClient } from '@prisma/client';
import { integrationDatabaseUrl, integrationTestsEnabled } from '@/lib/test/integrationGate';

const describeIntegration = integrationTestsEnabled() ? describe : describe.skip;

describeIntegration('database integration', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    const url = integrationDatabaseUrl();
    if (!url) {
      throw new Error('integrationDatabaseUrl() returned null while tests are enabled');
    }
    prisma = new PrismaClient({ datasources: { db: { url } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('connects and runs a read-only query', async () => {
    const count = await prisma.boutique.count();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('can resolve prisma schema models used by stabilization paths', async () => {
    await expect(prisma.importFileRecord.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.boutiqueMonthlyTarget.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});

describe('integration gate', () => {
  it('documents skip behavior when env is unset', () => {
    if (process.env.RUN_INTEGRATION_TESTS === '1') {
      expect(integrationTestsEnabled()).toBe(true);
    } else {
      expect(integrationTestsEnabled()).toBe(process.env.CI === 'true' && !!process.env.DATABASE_URL);
    }
  });
});
