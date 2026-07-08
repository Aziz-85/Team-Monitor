/**
 * Backfill Boutique Configuration for every active boutique.
 *
 * - Creates BoutiqueConfiguration (safe defaults) if missing.
 * - Creates default shift templates (Morning/Evening/Bridge) if missing.
 * - Creates a coverage policy per day if missing, copying legacy CoverageRule values where available.
 * - Idempotent. Never modifies or deletes CoverageRule.
 *
 * Run:
 *   npm run boutique-config:backfill
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' scripts/backfill-boutique-configuration.ts
 */

// Register path aliases before loading libs that use @/
const path = require('path') as typeof import('path');
const { register } = require('tsconfig-paths') as {
  register: (config: { baseUrl: string; paths: Record<string, string[]> }) => void;
};
register({ baseUrl: path.join(__dirname, '..'), paths: { '@/*': ['./*'] } });

import { prisma } from '../lib/db';
import { backfillBoutiqueConfiguration } from '../lib/boutique-config/backfill';

async function main() {
  const summary = await backfillBoutiqueConfiguration();
  console.log('Boutique Configuration backfill complete:');
  console.log(`  Boutiques processed:              ${summary.boutiquesProcessed}`);
  console.log(`  Configurations created:           ${summary.configsCreated}`);
  console.log(`  Shift templates created:          ${summary.templatesCreated}`);
  console.log(`  Coverage policies created:        ${summary.policiesCreated}`);
  console.log(`  Policies copied from CoverageRule:${summary.policiesCopiedFromCoverageRule}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
