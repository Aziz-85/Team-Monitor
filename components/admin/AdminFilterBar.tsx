'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminFilterJson } from '@/lib/scope/adminFilter';

type Boutique = { id: string; code: string; name: string };
type Region = { id: string; code: string; name: string };
type Group = { id: string; name: string; code?: string };

type Props = {
  filterLabel: string;
  onFilterChange: (filter: AdminFilterJson) => void;
  t: (key: string) => string;
};

export function AdminFilterBar({ filterLabel, onFilterChange, t }: Props) {
  const [filter, setFilter] = useState<AdminFilterJson>({ kind: 'ALL' });
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFilter = useCallback(() => {
    fetch('/api/me/admin-filter')
      .then((r) => r.json())
      .then((data) => {
        const f = (data as { filter?: AdminFilterJson }).filter;
        if (f && typeof f.kind === 'string') {
          const next = { kind: f.kind, ...(f.boutiqueId && { boutiqueId: f.boutiqueId }), ...(f.regionId && { regionId: f.regionId }), ...(f.groupId && { groupId: f.groupId }) };
          setFilter(next);
          onFilterChange(next);
        }
      })
      .catch(() => {});
  }, [onFilterChange]);

  useEffect(() => {
    loadFilter();
  }, [loadFilter]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/boutiques').then((r) => r.json()),
      fetch('/api/admin/regions').then((r) => r.json()),
      fetch('/api/admin/boutique-groups').then((r) => r.json()),
    ])
      .then(([bList, rList, gList]) => {
        setBoutiques(Array.isArray(bList) ? bList.map((b: Boutique) => ({ id: b.id, code: b.code, name: b.name })) : []);
        setRegions(Array.isArray(rList) ? rList.map((r: Region) => ({ id: r.id, code: r.code, name: r.name })) : []);
        setGroups(Array.isArray(gList) ? gList.map((g: Group) => ({ id: g.id, name: g.name, code: g.code })) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const apply = useCallback(
    (newFilter: AdminFilterJson) => {
      setFilter(newFilter);
      fetch('/api/me/admin-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFilter),
      })
        .then((r) => r.ok && r.json())
        .then(() => onFilterChange(newFilter))
        .catch(() => {});
    },
    [onFilterChange]
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-600">{filterLabel}:</span>
      <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-800">{filter.kind === 'ALL' ? t('admin.filterAll') : filter.kind}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => apply({ kind: 'ALL' })}
          className={`rounded border px-2 py-1 text-xs ${filter.kind === 'ALL' ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          {t('admin.filterAll')}
        </button>
        {!loading && (
          <>
            {boutiques.length > 0 && (
              <select
                value={filter.kind === 'BOUTIQUE' ? filter.boutiqueId ?? '' : ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) apply({ kind: 'BOUTIQUE', boutiqueId: id });
                  else apply({ kind: 'ALL' });
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              >
                <option value="">{t('admin.filterByBoutique')}</option>
                {boutiques.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            )}
            {regions.length > 0 && (
              <select
                value={filter.kind === 'REGION' ? filter.regionId ?? '' : ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) apply({ kind: 'REGION', regionId: id });
                  else apply({ kind: 'ALL' });
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              >
                <option value="">{t('admin.filterByRegion')}</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {groups.length > 0 && (
              <select
                value={filter.kind === 'GROUP' ? filter.groupId ?? '' : ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) apply({ kind: 'GROUP', groupId: id });
                  else apply({ kind: 'ALL' });
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              >
                <option value="">{t('admin.filterByGroup')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    </div>
  );
}
