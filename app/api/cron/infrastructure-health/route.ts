import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import type { InfrastructureHealthStatus } from '@prisma/client';
import { INFRASTRUCTURE_APPS, infrastructureFlags } from '@/config/infrastructure/apps';
import { callInfrastructureAgent } from '@/lib/infrastructure/agentClient';
import { prisma } from '@/lib/db';
import { noOpInfrastructureNotifier } from '@/lib/infrastructure/notifier';

function authorized(request: NextRequest): boolean {
  const expected = process.env.INFRASTRUCTURE_POLL_TOKEN || '';
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 32) return false; const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
function mapStatus(value: unknown): InfrastructureHealthStatus {
  switch (String(value).toLowerCase()) { case 'healthy': return 'HEALTHY'; case 'warning': return 'WARNING'; case 'down': return 'DOWN'; case 'disabled': return 'DISABLED'; default: return 'UNKNOWN'; }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!infrastructureFlags.dashboard) return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
  const results = [];
  for (const app of INFRASTRUCTURE_APPS) {
    const started = Date.now(); let payload: Record<string, unknown> = { status: 'unknown' };
    try { payload = await callInfrastructureAgent(`/v1/apps/${app.id}/health`); } catch { /* UNKNOWN is distinct from DOWN. */ }
    const status = mapStatus(payload.status);
    const previous = await prisma.infrastructureHealthCheck.findFirst({ where: { appId: app.id }, orderBy: { checkedAt: 'desc' }, select: { status: true } });
    const checkedAt = new Date();
    await prisma.infrastructureHealthCheck.create({ data: { appId: app.id, status, httpStatus: typeof payload.httpStatus === 'number' ? payload.httpStatus : null, responseMs: Date.now() - started, summary: status === 'UNKNOWN' ? 'Agent unavailable or response unknown' : `HTTP health is ${status.toLowerCase()}`, requestId: typeof payload.requestId === 'string' ? payload.requestId : null } });
    if (previous?.status !== status && ['DOWN', 'HEALTHY', 'WARNING'].includes(status)) await noOpInfrastructureNotifier.healthTransition({ appId: app.id, from: previous?.status ?? null, to: status, checkedAt });
    results.push({ appId: app.id, status });
  }
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), results });
}
