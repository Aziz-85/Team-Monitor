import { infrastructureRequestTimeoutMs } from '@/config/infrastructure/apps';

export class InfrastructureAgentError extends Error {
  constructor(public code: 'DISABLED' | 'UNAVAILABLE' | 'TIMEOUT' | 'MALFORMED' | 'AGENT_ERROR', public requestId?: string) {
    super(code); this.name = 'InfrastructureAgentError';
  }
}

function config() {
  const url = process.env.INFRASTRUCTURE_AGENT_URL?.trim() || 'http://127.0.0.1:4317';
  const token = process.env.INFRASTRUCTURE_AGENT_TOKEN?.trim() || '';
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(url)) throw new InfrastructureAgentError('DISABLED');
  if (token.length < 32) throw new InfrastructureAgentError('DISABLED');
  return { url, token };
}

export async function callInfrastructureAgent(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const { url, token } = config();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), infrastructureRequestTimeoutMs());
  try {
    const response = await fetch(`${url}${path}`, {
      ...init, signal: controller.signal, cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    const requestId = response.headers.get('x-request-id') || undefined;
    const payload: unknown = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new InfrastructureAgentError('MALFORMED', requestId);
    if (!response.ok) throw new InfrastructureAgentError('AGENT_ERROR', requestId);
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InfrastructureAgentError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new InfrastructureAgentError('TIMEOUT');
    throw new InfrastructureAgentError('UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
