'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Role } from '@prisma/client';
import type { ScopeSelectionJson } from '@/lib/scope/types';

type ScopeApi = {
  stored: ScopeSelectionJson | null;
  resolved: { scope: string; boutiqueIds: string[]; label: string };
  role: string;
  canSelectRegionGroup: boolean;
};

type BoutiquesApi = {
  boutiques: { id: string; code: string; name: string; regionId: string | null }[];
  regions: { id: string; code: string; name: string }[];
  groups: { id: string; name: string; boutiqueIds: string[] }[];
  canSelectRegionGroup: boolean;
};

export function ScopeSelector({ role }: { role: Role }) {
  void role; // used by parent for prop typing; canSelectRegionGroup comes from API
  const [scope, setScope] = useState<ScopeApi | null>(null);
  const [boutiques, setBoutiques] = useState<BoutiquesApi | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/me/scope').then((r) => r.json()),
      fetch('/api/me/boutiques').then((r) => r.json()),
    ]).then(([scopeData, boutiquesData]) => {
      setScope(scopeData);
      setBoutiques(boutiquesData);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canSelect = scope?.canSelectRegionGroup ?? false;
  const label = scope?.resolved?.label ?? '—';

  const apply = async (selection: ScopeSelectionJson) => {
    const res = await fetch('/api/me/scope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = typeof (err as { error?: string }).error === 'string'
        ? (err as { error?: string }).error
        : `Failed to update scope (${res.status})`;
      alert(msg);
      return;
    }
    setOpen(false);
    load();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('scope-changed'));
    }
  };

  if (!scope) {
    return (
      <div className="min-w-0 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
        —
      </div>
    );
  }

  if (!canSelect) {
    return (
      <div
        className="min-w-0 truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
        title={label}
      >
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 max-w-full items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
        title={label}
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg className="h-3 w-3 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && boutiques && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="max-h-64 overflow-y-auto p-2">
              <p className="mb-2 text-xs font-medium text-slate-500">Scope</p>
              {boutiques.boutiques.length <= 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    boutiques.boutiques[0] &&
                    apply({ scope: 'BOUTIQUE', boutiqueId: boutiques.boutiques[0].id })
                  }
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {boutiques.boutiques[0]?.name ?? '—'}
                </button>
              ) : (
                <>
                  <p className="mb-1 text-xs text-slate-500">Boutique</p>
                  {boutiques.boutiques.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => apply({ scope: 'BOUTIQUE', boutiqueId: b.id })}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                    >
                      {b.name} ({b.code})
                    </button>
                  ))}
                  {boutiques.regions.length > 0 && (
                    <>
                      <p className="mt-2 mb-1 text-xs text-slate-500">Region</p>
                      {boutiques.regions.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => apply({ scope: 'REGION', regionId: r.id })}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                        >
                          {r.name}
                        </button>
                      ))}
                    </>
                  )}
                  {boutiques.groups.length > 0 && (
                    <>
                      <p className="mt-2 mb-1 text-xs text-slate-500">Group</p>
                      {boutiques.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => apply({ scope: 'GROUP', groupId: g.id })}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                        >
                          {g.name}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
