'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RolePreviewState } from '@/lib/rolePreview';

export function RolePreviewBanner({ preview }: { preview: RolePreviewState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const exit = async () => {
    setBusy(true);
    try {
      await fetch('/api/admin/role-preview/session', { method: 'DELETE' });
      window.location.assign('/admin/role-preview');
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <div className="sticky top-0 z-[80] border-b border-amber-300 bg-amber-100 px-3 py-2 text-amber-950 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="text-sm"><strong>TEST VIEW · {preview.targetName}</strong><span className="ms-2 text-xs">{preview.targetRole} · {preview.boutiqueIds.length} boutique{preview.boutiqueIds.length === 1 ? '' : 's'} · Read only</span></div>
        <button type="button" disabled={busy} onClick={exit} className="rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">{busy ? '…' : 'Exit preview'}</button>
      </div>
    </div>
  );
}
