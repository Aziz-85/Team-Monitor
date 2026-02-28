'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Role } from '@prisma/client';

type OperationalBoutiqueApi = {
  boutiqueId: string;
  label: string;
  canSelect: boolean;
};

/** Read-only banner: "Working on: {label}". No dropdown, no switching. */
export function OperationalBoutiqueSelector({ role }: { role: Role }) {
  void role;
  const [data, setData] = useState<OperationalBoutiqueApi | null>(null);

  const load = useCallback(() => {
    fetch('/api/me/operational-boutique')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="min-w-0 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
        —
      </div>
    );
  }

  const label = data.label || '—';

  return (
    <div
      className="min-w-0 truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
      title={label}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}
