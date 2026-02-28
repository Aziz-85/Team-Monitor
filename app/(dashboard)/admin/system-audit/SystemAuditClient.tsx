'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';

type DocEntry = { name: string; description: string };

export function SystemAuditClient() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(() => {
    setError('');
    fetch('/api/admin/audit-docs')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDocs(data.docs ?? []);
        if (data.docs?.length && !selected) setSelected(data.docs[0].name);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load list'));
  }, [selected]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) {
      setContent('');
      return;
    }
    setLoading(true);
    setContent('');
    setError('');
    fetch(`/api/admin/audit-docs?file=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContent(data.content ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load file'))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <OpsCard title="System audit docs">
        <p className="text-sm text-slate-600 mb-4">
          Read-only view of docs in <code className="bg-slate-100 px-1 rounded">docs/audit/</code>. Use for plan, scope, and gap review.
        </p>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <label htmlFor="audit-doc" className="text-sm font-medium text-slate-700">Document:</label>
          <select
            id="audit-doc"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm bg-white min-w-[200px]"
          >
            {docs.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        {loading && <p className="text-slate-500 text-sm">Loading…</p>}
        {content && (
          <pre className="bg-slate-50 border border-slate-200 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-[70vh] overflow-y-auto">
            {content}
          </pre>
        )}
      </OpsCard>
    </div>
  );
}
