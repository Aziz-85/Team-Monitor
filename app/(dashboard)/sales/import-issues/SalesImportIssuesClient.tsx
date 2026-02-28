'use client';

import { useState } from 'react';

type ImportIssue = {
  id: string;
  batchId: string;
  severity: string;
  status: string;
  message: string;
  rowIndex: number | null;
  metadata?: unknown;
};

export function SalesImportIssuesClient({ canResolve }: { canResolve: boolean }) {
  const [batchId, setBatchId] = useState('');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/import-issues?batchId=${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to load');
        setIssues([]);
        return;
      }
      const data = await res.json();
      setIssues(data.issues ?? []);
    } finally {
      setLoading(false);
    }
  };

  const resolve = async (issueId: string, status: 'RESOLVED' | 'IGNORED') => {
    if (!canResolve) return;
    try {
      const res = await fetch(`/api/sales/import-issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to update');
        return;
      }
      if (batchId) load(batchId);
    } catch {
      alert('Request failed');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Import Issues</h1>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <button
          type="button"
          onClick={() => load(batchId)}
          disabled={loading || !batchId.trim()}
          className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="space-y-2">
        {issues.map((iss) => (
          <div
            key={iss.id}
            className={`rounded border p-3 ${
              iss.severity === 'BLOCK' ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="mr-2 font-medium">{iss.severity}</span>
                <span className="text-slate-600">{iss.status}</span>
                {iss.rowIndex != null && <span className="ml-2 text-slate-500">Row {iss.rowIndex}</span>}
                <p className="mt-1 text-sm">{iss.message}</p>
                {iss.metadata != null && (
                  <pre className="mt-1 text-xs text-slate-500">
                    {JSON.stringify(iss.metadata)}
                  </pre>
                )}
              </div>
              {canResolve && iss.status === 'OPEN' && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => resolve(iss.id, 'RESOLVED')}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => resolve(iss.id, 'IGNORED')}
                    className="rounded bg-slate-500 px-2 py-1 text-xs text-white"
                  >
                    Ignore
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {issues.length === 0 && !loading && batchId.trim() && !error && (
        <p className="text-slate-500">No issues for this batch.</p>
      )}
    </div>
  );
}
