'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';

type AllowedBoutiquesRes = { boutiques: { code: string; name: string }[]; defaultCode: string };

/**
 * SUPER_ADMIN only. Dropdown that sets ?b=CODE on current URL (no persistence). Selecting triggers router.replace + refresh.
 */
export function SuperAdminBoutiqueContextPicker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AllowedBoutiquesRes | null>(null);

  const currentB = searchParams.get('b') || searchParams.get('boutique') || '';

  useEffect(() => {
    fetch('/api/scope/allowed-boutiques', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.boutiques.length <= 1) return null;

  const effectiveCode = currentB || data.defaultCode;
  const options = data.boutiques;

  const handleChange = (code: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (code === data.defaultCode) {
      params.delete('b');
      params.delete('boutique');
    } else {
      params.set('b', code);
    }
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    router.refresh();
  };

  return (
    <select
      value={effectiveCode}
      onChange={(e) => handleChange(e.target.value)}
      className="min-w-0 max-w-[160px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
      title="View data for boutique (URL only)"
    >
      {options.map((b) => (
        <option key={b.code} value={b.code}>
          {b.name} ({b.code})
        </option>
      ))}
    </select>
  );
}
