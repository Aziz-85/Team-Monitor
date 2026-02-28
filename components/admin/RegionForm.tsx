'use client';

import { useState, useCallback } from 'react';

export type RegionFormValues = { name: string; code: string };

type RegionFormProps = {
  initial?: Partial<RegionFormValues>;
  onSubmit: (values: RegionFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  nameLabel: string;
};

export function RegionForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  nameLabel,
}: RegionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await onSubmit({ name: name.trim(), code: code.trim().toUpperCase() });
      } finally {
        setSaving(false);
      }
    },
    [name, code, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{nameLabel}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase text-slate-900"
          required
          disabled={!!initial?.code}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50">
          {saving ? '…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
