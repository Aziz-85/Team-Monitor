/**
 * Prepare outbound payloads for Planner.
 * Dry-run safe when Graph not configured.
 */

import { prisma } from '@/lib/db';
import { isGraphConfigured } from './graphClient';
import type { PlannerIntegrationMode } from './types';

export type OutboundResult = {
  pushed: number;
  skipped: number;
  errors: string[];
  configured: boolean;
};

export async function pushOutbound(
  integrationId: string,
  mode: PlannerIntegrationMode
): Promise<OutboundResult> {
  const errors: string[] = [];
  const pushed = 0;
  let skipped = 0;

  if (!isGraphConfigured()) {
    await prisma.plannerSyncLog.create({
      data: {
        integrationId,
        direction: 'OUTBOUND',
        mode,
        eventType: 'OUTBOUND_PUSH',
        status: 'SKIPPED',
        message: 'Graph not configured',
      },
    });
    return { pushed: 0, skipped: 0, errors: ['Graph API not configured'], configured: false };
  }

  const links = await prisma.plannerTaskLink.findMany({
    where: { syncStatus: 'PENDING' },
    take: 50,
  });

  skipped = links.length;

  await prisma.plannerSyncLog.create({
    data: {
      integrationId,
      direction: 'OUTBOUND',
      mode,
      eventType: 'OUTBOUND_PUSH',
      status: 'SUCCESS',
      message: `Dry-run: ${pushed} pushed, ${skipped} skipped`,
    },
  });

  return { pushed, skipped, errors, configured: true };
}
