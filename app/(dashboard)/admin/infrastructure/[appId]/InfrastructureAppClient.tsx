'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/client/authFetch';
import { OpsCard } from '@/components/ui/OpsCard';

type App = { id: string; displayName: string; domain: string; port: number; features: Record<string, boolean> };
export function InfrastructureAppClient({ app }: { app: App }) {
  const [status, setStatus] = useState<Record<string, unknown>>({}); const [health, setHealth] = useState<Record<string, unknown>>({}); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = useCallback(async () => { const [s, h] = await Promise.all([fetch(`/api/admin/infrastructure/${app.id}?view=status`), fetch(`/api/admin/infrastructure/${app.id}?view=health`)]); setStatus(await s.json()); setHealth(await h.json()); }, [app.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function operate(action: 'restart' | 'deploy' | 'backup') {
    const confirmation = window.prompt(`Type ${app.displayName} to confirm ${action}.`); if (confirmation !== app.displayName) return;
    if (action === 'deploy' && !window.confirm('Deploy is a second-stage confirmation. Continue?')) return;
    setBusy(true); setMessage('Operation in progress…');
    try { const response = await authFetch(`/api/admin/infrastructure/${app.id}`, { method: 'POST', body: JSON.stringify({ action, confirmation, deployConfirmed: action === 'deploy' }) }); const body = await response.json(); setMessage(response.ok ? `Completed. Request ID: ${body.requestId}` : `Failed: ${body.error}${body.requestId ? ` · ${body.requestId}` : ''}`); if (response.ok) await refresh(); } finally { setBusy(false); }
  }
  const diagnostics = JSON.stringify({ app: { id: app.id, domain: app.domain, port: app.port }, status, health, capturedAt: new Date().toISOString() }, null, 2);
  return <div className="p-4 md:p-6"><div className="mx-auto max-w-4xl space-y-4"><div><h1 className="text-xl font-semibold">{app.displayName}</h1><p className="text-sm text-muted">{app.domain} · port {app.port}</p></div><div className="grid gap-4 md:grid-cols-2"><OpsCard><h2 className="mb-2 font-medium">Runtime status</h2><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(status, null, 2)}</pre></OpsCard><OpsCard><h2 className="mb-2 font-medium">HTTP health</h2><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(health, null, 2)}</pre></OpsCard></div><OpsCard><div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void refresh()}>Refresh status</button>{app.features.restart && <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void operate('restart')}>Restart</button>}{app.features.deploy && <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void operate('deploy')}>Deploy</button>}{app.features.backup && <button className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => void operate('backup')}>Create backup</button>}<button className="rounded border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(diagnostics)}>Copy diagnostics</button></div>{message && <p className="mt-3 text-sm">{message}</p>}</OpsCard><OpsCard><h2 className="mb-2 font-medium">Recent operations</h2><p className="text-sm text-muted">Operation, backup, and health history becomes available after the database migration and scheduled polling are installed.</p></OpsCard></div></div>;
}
