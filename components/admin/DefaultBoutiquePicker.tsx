'use client';

import { useState, useCallback } from 'react';

type Boutique = { id: string; code: string; name: string };

type DefaultBoutiquePickerProps = {
  current: { defaultBoutiqueId: string | null; boutique: Boutique | null };
  boutiques: Boutique[];
  onSave: (boutiqueId: string) => Promise<void>;
  confirmMessage: string;
  saveLabel: string;
  titleLabel: string;
};

export function DefaultBoutiquePicker({
  current,
  boutiques,
  onSave,
  confirmMessage,
  saveLabel,
  titleLabel,
}: DefaultBoutiquePickerProps) {
  const [selectedId, setSelectedId] = useState(current.defaultBoutiqueId ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!selectedId) return;
    if (selectedId !== current.defaultBoutiqueId && !window.confirm(confirmMessage)) return;
    setSaving(true);
    try {
      await onSave(selectedId);
    } finally {
      setSaving(false);
    }
  }, [selectedId, current.defaultBoutiqueId, confirmMessage, onSave]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{titleLabel}</p>
      {current.boutique && (
        <p className="text-sm font-medium text-slate-900">
          Current: {current.boutique.name} ({current.boutique.code})
        </p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Default boutique</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          <option value="">—</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !selectedId}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? '…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
