import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID, timingSafeEqual } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { cpus, freemem, loadavg, totalmem, uptime } from 'os';
import { z } from 'zod';
import {
  INFRASTRUCTURE_APPS, getInfrastructureApp, infrastructureFlags,
  infrastructureRequestTimeoutMs, type InfrastructureAppDefinition,
} from '../../config/infrastructure/apps';
import { redactSecrets } from './redact';

const execFileAsync = promisify(execFile);
const host = process.env.INFRASTRUCTURE_AGENT_HOST?.trim() || '127.0.0.1';
const port = Number(process.env.INFRASTRUCTURE_AGENT_PORT || '4317');
const token = process.env.INFRASTRUCTURE_AGENT_TOKEN || '';
const timeout = infrastructureRequestTimeoutMs();
const maxBody = 4096;
const locks = new Set<string>();
const requests = new Map<string, { count: number; resetAt: number }>();
const ConfirmSchema = z.object({ confirmation: z.string().min(1).max(100) }).strict();

type Json = Record<string, unknown> | unknown[];

function log(level: 'info' | 'warn' | 'error', event: string, requestId: string, extra: object = {}) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, requestId, ...extra }) + '\n');
}

function reply(res: ServerResponse, status: number, body: Json, requestId: string) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authenticated(req: IncomingMessage): boolean {
  if (token.length < 32) return false;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rateLimited(ip: string): boolean {
  const now = Date.now(); const current = requests.get(ip);
  if (!current || current.resetAt <= now) { requests.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > 60;
}

async function body(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > maxBody) throw new Error('BODY_TOO_LARGE'); }
  return raw ? JSON.parse(raw) : {};
}

async function run(file: string, args: readonly string[], cwd?: string) {
  const result = await execFileAsync(file, [...args], { cwd, timeout, maxBuffer: 512 * 1024, windowsHide: true });
  return { stdout: redactSecrets(result.stdout), stderr: redactSecrets(result.stderr) };
}

async function pm2Status(app: InfrastructureAppDefinition) {
  const { stdout } = await run('pm2', ['jlist']);
  const rows = JSON.parse(stdout) as Array<Record<string, any>>;
  const row = rows.find((item) => item.name === app.pm2Name);
  if (!row) return { status: 'unknown', pm2Name: app.pm2Name };
  return {
    status: row.pm2_env?.status ?? 'unknown', uptime: row.pm2_env?.pm_uptime ?? null,
    restartCount: row.pm2_env?.restart_time ?? null, cpu: row.monit?.cpu ?? null,
    memory: row.monit?.memory ?? null, version: row.pm2_env?.version ?? null,
  };
}

async function health(app: InfrastructureAppDefinition) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(timeout, 10_000));
  try {
    const response = await fetch(app.healthCheckUrl, { signal: controller.signal, redirect: 'manual' });
    return { status: response.ok ? 'healthy' : 'warning', httpStatus: response.status, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: 'down', error: error instanceof Error ? error.name : 'HEALTH_FAILED', checkedAt: new Date().toISOString() };
  } finally { clearTimeout(timer); }
}

async function serviceStatus(name: 'nginx' | 'postgresql' | 'docker'): Promise<string> {
  try { const result = await run('systemctl', ['is-active', name]); return result.stdout.trim() || 'unknown'; } catch { return 'unknown'; }
}

async function systemStatus() {
  let disk: Record<string, number> | null = null;
  try {
    const result = await run('df', ['-Pk', '/']); const columns = result.stdout.trim().split('\n').at(-1)?.trim().split(/\s+/);
    if (columns && columns.length >= 6) disk = { totalKb: Number(columns[1]), usedKb: Number(columns[2]), availableKb: Number(columns[3]), usedPercent: Number(columns[4].replace('%', '')) };
  } catch { /* Disk remains unknown. */ }
  const [nginx, postgresql, docker] = await Promise.all([serviceStatus('nginx'), serviceStatus('postgresql'), serviceStatus('docker')]);
  return { uptimeSeconds: uptime(), cpuCount: cpus().length, loadAverage: loadavg(), memory: { total: totalmem(), free: freemem() }, disk, services: { nginx, postgresql, docker } };
}

async function fixedAction(action: 'restart' | 'deploy' | 'backup', app: InfrastructureAppDefinition) {
  const script = `${process.cwd()}/scripts/infrastructure/${action === 'restart' ? 'restart-app' : action === 'deploy' ? 'deploy-app' : 'backup-database'}.sh`;
  return run(script, [app.id]);
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestId = (typeof req.headers['x-request-id'] === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(req.headers['x-request-id']))
    ? req.headers['x-request-id'] : randomUUID();
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  log('info', 'request.started', requestId, { method: req.method, path: url.pathname });
  if (url.pathname === '/health' && req.method === 'GET') return reply(res, 200, { status: 'ok', requestId }, requestId);
  if (rateLimited(req.socket.remoteAddress || 'unknown')) return reply(res, 429, { error: 'RATE_LIMITED', requestId }, requestId);
  if (!authenticated(req)) return reply(res, 401, { error: 'UNAUTHORIZED', requestId }, requestId);

  if (url.pathname === '/v1/apps' && req.method === 'GET') {
    return reply(res, 200, { apps: INFRASTRUCTURE_APPS.map(({ cwd: _cwd, ...app }) => app), requestId }, requestId);
  }
  if (url.pathname === '/v1/system/status' && req.method === 'GET') {
    return reply(res, 200, { requestId, ...(await systemStatus()) }, requestId);
  }
  const match = url.pathname.match(/^\/v1\/apps\/([a-z0-9-]+)\/(status|health|logs|restart|deploy|backup)$/);
  if (!match) return reply(res, 404, { error: 'NOT_FOUND', requestId }, requestId);
  const app = getInfrastructureApp(match[1]);
  if (!app) return reply(res, 404, { error: 'UNKNOWN_APP', requestId }, requestId);
  const action = match[2];
  try {
    if (req.method === 'GET' && action === 'status') return reply(res, 200, { appId: app.id, ...(await pm2Status(app)), requestId }, requestId);
    if (req.method === 'GET' && action === 'health') return reply(res, 200, { appId: app.id, ...(await health(app)), requestId }, requestId);
    if (req.method === 'GET' && action === 'logs') {
      if (!app.logsEnabled) return reply(res, 403, { error: 'FEATURE_DISABLED', requestId }, requestId);
      const lines = Math.min(500, Math.max(1, Number(url.searchParams.get('lines') || '100') || 100));
      const output = await run('pm2', ['logs', app.pm2Name, '--lines', String(lines), '--nostream']);
      return reply(res, 200, { appId: app.id, lines, ...output, requestId }, requestId);
    }
    if (req.method !== 'POST' || !['restart', 'deploy', 'backup'].includes(action)) return reply(res, 405, { error: 'METHOD_NOT_ALLOWED', requestId }, requestId);
    const parsed = ConfirmSchema.safeParse(await body(req));
    if (!parsed.success || parsed.data.confirmation !== app.displayName) return reply(res, 400, { error: 'CONFIRMATION_REQUIRED', requestId }, requestId);
    const allowed = infrastructureFlags.actions && ((action === 'restart' && app.restartEnabled) || (action === 'deploy' && app.deploymentEnabled) || (action === 'backup' && app.databaseBackupEnabled));
    if (!allowed) return reply(res, 403, { error: 'FEATURE_DISABLED', requestId }, requestId);
    if (locks.has(app.id)) return reply(res, 409, { error: 'APP_BUSY', requestId }, requestId);
    locks.add(app.id);
    try {
      const output = await fixedAction(action as 'restart' | 'deploy' | 'backup', app);
      log('info', 'operation.completed', requestId, { appId: app.id, action });
      return reply(res, 200, { appId: app.id, action, ...output, requestId }, requestId);
    } finally { locks.delete(app.id); }
  } catch (error) {
    log('error', 'request.failed', requestId, { code: error instanceof Error ? error.name : 'ERROR' });
    return reply(res, 500, { error: 'OPERATION_FAILED', requestId }, requestId);
  }
}

if (host !== '127.0.0.1' && host !== '::1') throw new Error('Infrastructure agent must bind to loopback');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid INFRASTRUCTURE_AGENT_PORT');
if (token.length < 32) throw new Error('INFRASTRUCTURE_AGENT_TOKEN must contain at least 32 characters');
createServer((req, res) => void handler(req, res)).listen(port, host, () => log('info', 'agent.started', 'startup', { host, port }));
