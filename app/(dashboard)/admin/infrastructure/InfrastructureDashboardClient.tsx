'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';

type AppRow = { id: string; displayName: string; domain: string; port: number; process?: Record<string, unknown>; health?: Record<string, unknown>; checkedAt?: string };
type Dashboard = { enabled: boolean; agentStatus: string; apps: AppRow[]; system?: { loadAverage?: unknown; cpuCount?: unknown; memory?: { free?: unknown } }; error?: string };
const color: Record<string, string> = { healthy: 'text-success', online: 'text-success', warning: 'text-warning', down: 'text-danger', unknown: 'text-muted', disabled: 'text-muted' };

export function InfrastructureDashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null); const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => { setLoading(true); try { const response = await fetch('/api/admin/infrastructure', { cache: 'no-store' }); setData(await response.json()); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <div className="p-4 md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold text-foreground">Infrastructure</h1><p className="text-sm text-muted">Production application health and controlled operations</p></div><button className="rounded-lg border px-3 py-2 text-sm" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh status'}</button></div>
    <OpsCard><div className="flex justify-between"><span>Local agent</span><span className={color[data?.agentStatus || 'unknown']}>{data?.agentStatus || 'Unknown'}</span></div>{data?.error && <p className="mt-2 text-xs text-muted">Agent response: {data.error}</p>}</OpsCard>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(data?.apps || []).map((app) => { const health = String(app.health?.status || 'unknown'); const pm2 = String(app.process?.status || 'unknown'); return <Link href={`/admin/infrastructure/${app.id}`} key={app.id}><OpsCard className="h-full space-y-3 transition-colors hover:bg-surface-subtle"><div><h2 className="font-medium">{app.displayName}</h2><p className="text-xs text-muted">{app.domain} · 127.0.0.1:{app.port}</p></div><div className="grid grid-cols-2 gap-2 text-sm"><span>HTTP</span><span className={color[health]}>{health}</span><span>PM2</span><span className={color[pm2]}>{pm2}</span><span>CPU</span><span>{String(app.process?.cpu ?? '—')}%</span><span>Memory</span><span>{app.process?.memory ? `${Math.round(Number(app.process.memory) / 1048576)} MB` : '—'}</span><span>Restarts</span><span>{String(app.process?.restartCount ?? '—')}</span></div></OpsCard></Link>; })}</div>
    {data?.system && <OpsCard><h2 className="mb-3 font-medium">Host</h2><div className="grid gap-2 text-sm sm:grid-cols-3"><span>Load: {Array.isArray(data.system.loadAverage) ? data.system.loadAverage.join(' / ') : '—'}</span><span>CPUs: {String(data.system.cpuCount ?? '—')}</span><span>Free RAM: {data.system.memory ? `${Math.round(Number(data.system.memory.free) / 1048576)} MB` : '—'}</span></div></OpsCard>}
  </div></div>;
}
