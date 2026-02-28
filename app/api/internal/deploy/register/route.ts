import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { APP_VERSION, GIT_HASH, getEnvironment } from '@/lib/version';
import { hostname } from 'os';

/**
 * Machine-to-machine deploy registration. No session/cookies.
 * Auth: Header "x-deploy-secret" must equal DEPLOY_REGISTER_SECRET.
 * Creates or updates a DeployRecord (deploySource=github). Dedupe by (appVersion, gitHash, environment).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-deploy-secret');
  const expected = process.env.DEPLOY_REGISTER_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const existing = await prisma.deployRecord.findUnique({
    where: {
      appVersion_gitHash_environment: { appVersion, gitHash, environment },
    },
  });

  if (existing) {
    await prisma.deployRecord.update({
      where: { id: existing.id },
      data: {
        buildDate,
        serverHost,
        serverIp,
        deploySource: 'github',
        notes,
      },
    });
    return NextResponse.json({ ok: true, deduped: true });
  }

  await prisma.deployRecord.create({
    data: {
      appVersion,
      gitHash,
      buildDate,
      environment,
      serverHost,
      serverIp,
      deployedByUserId: null,
      deploySource: 'github',
      notes,
    },
  });

  return NextResponse.json({ ok: true });
}
