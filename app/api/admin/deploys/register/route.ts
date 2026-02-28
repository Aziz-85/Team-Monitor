import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';
import { APP_VERSION, GIT_HASH, getEnvironment } from '@/lib/version';
import { hostname } from 'os';

/** POST: register current deploy as a DeployRecord. ADMIN only. */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  let body: { notes?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const buildDateStr = process.env.NEXT_PUBLIC_BUILD_DATE;
  const buildDate = buildDateStr ? new Date(buildDateStr) : new Date();
  const environment = getEnvironment();
  const appVersion = APP_VERSION;
  const gitHash = GIT_HASH || 'unknown';

  let serverHost: string | null = null;
  let serverIp: string | null = null;
  try {
    serverHost = hostname();
  } catch {
    // ignore
  }
  // Best-effort server IP: not required, skip if unavailable to avoid failing
  try {
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets || {})) {
      const n = nets[name];
      if (!n) continue;
      for (const iface of n) {
        if (iface.family === 'IPv4' && !iface.internal) {
          serverIp = iface.address;
          break;
        }
      }
      if (serverIp) break;
    }
  } catch {
    // ignore
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

  const record = await prisma.deployRecord.upsert({
    where: {
      appVersion_gitHash_environment: { appVersion, gitHash, environment },
    },
    create: {
      appVersion,
      gitHash,
      buildDate,
      environment,
      serverHost,
      serverIp,
      deployedByUserId: user.id,
      deploySource: 'manual',
      notes,
    },
    update: {
      buildDate,
      serverHost,
      serverIp,
      deployedByUserId: user.id,
      deploySource: 'manual',
      notes,
    },
  });

  return NextResponse.json(record);
}
