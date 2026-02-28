'use client';

import { useState, useCallback } from 'react';

export type GroupFormValues = { name: string; code: string | null; isActive: boolean };

type GroupFormProps = {
  initial?: Partial<GroupFormValues>;
  onSubmit: (values: GroupFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  nameLabel: string;
};

export function GroupForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  nameLabel,
}: GroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await onSubmit({
          name: name.trim(),
          code: code.trim() || null,
          isActive,
        });
      } finally {
        setSaving(false);
      }
    },
    [name, code, isActive, onSubmit]
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
        <label className="mb-1 block text-sm font-medium text-slate-700">Code (optional)</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="group-active"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <label htmlFor="group-active" className="text-sm text-slate-700">Active</label>
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
