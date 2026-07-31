import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getInfrastructureApp, infrastructureFlags } from '@/config/infrastructure/apps';
import { validateCsrf } from '@/lib/csrf';
import { prisma } from '@/lib/db';
import { requireInfrastructureAdmin } from '@/lib/infrastructure/authorization';
import { callInfrastructureAgent, InfrastructureAgentError } from '@/lib/infrastructure/agentClient';

const ActionSchema = z.object({
  action: z.enum(['restart', 'deploy', 'backup']), confirmation: z.string().min(1).max(100), deployConfirmed: z.boolean().optional(),
}).strict();

export async function GET(request: NextRequest, { params }: { params: { appId: string } }) {
  try { await requireInfrastructureAdmin(); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const app = getInfrastructureApp(params.appId); if (!app) return NextResponse.json({ error: 'Unknown application' }, { status: 404 });
  if (!infrastructureFlags.dashboard) return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
  const view = request.nextUrl.searchParams.get('view') || 'status';
  if (!['status', 'health', 'logs'].includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  if (view === 'logs' && !app.logsEnabled) return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
  const lines = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get('lines') || '100') || 100));
  try { return NextResponse.json(await callInfrastructureAgent(`/v1/apps/${app.id}/${view}${view === 'logs' ? `?lines=${lines}` : ''}`)); }
  catch (error) { const code = error instanceof InfrastructureAgentError ? error.code : 'UNAVAILABLE'; return NextResponse.json({ error: code }, { status: code === 'TIMEOUT' ? 504 : 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: { appId: string } }) {
  let user; try { user = await requireInfrastructureAdmin(); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  const app = getInfrastructureApp(params.appId); if (!app) return NextResponse.json({ error: 'Unknown application' }, { status: 404 });
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmation !== app.displayName || (parsed.data.action === 'deploy' && parsed.data.deployConfirmed !== true)) return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
  const flags = { restart: app.restartEnabled, deploy: app.deploymentEnabled, backup: app.databaseBackupEnabled };
  if (!infrastructureFlags.actions || !flags[parsed.data.action]) return NextResponse.json({ error: 'Feature disabled' }, { status: 403 });
  const requestId = randomUUID(); const started = Date.now();
  const operation = await prisma.infrastructureOperation.create({ data: {
    appId: app.id, operationType: parsed.data.action.toUpperCase() as 'RESTART' | 'DEPLOY' | 'BACKUP', status: 'RUNNING',
    requestedByUserId: user.id, requestedByName: user.employee?.name || user.empId, requestId,
    summary: `${parsed.data.action} requested from infrastructure dashboard`, metadataJson: { source: 'admin-dashboard' },
  }});
  try {
    const result = await callInfrastructureAgent(`/v1/apps/${app.id}/${parsed.data.action}`, { method: 'POST', headers: { 'x-request-id': requestId }, body: JSON.stringify({ confirmation: app.displayName }) });
    await prisma.infrastructureOperation.update({ where: { id: operation.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), durationMs: Date.now() - started, summary: `${parsed.data.action} completed` } });
    return NextResponse.json({ ok: true, requestId: String(result.requestId || requestId) });
  } catch (error) {
    const code = error instanceof InfrastructureAgentError ? error.code : 'UNAVAILABLE';
    await prisma.infrastructureOperation.update({ where: { id: operation.id }, data: { status: 'FAILED', completedAt: new Date(), durationMs: Date.now() - started, errorCode: code, errorMessageSanitized: 'Infrastructure operation did not complete.' } });
    return NextResponse.json({ error: code, requestId }, { status: code === 'TIMEOUT' ? 504 : 503 });
  }
}
