'use client';

import type { ExternalSupportDraft } from '@/lib/schedule-next/types';

type Props = {
  open: boolean;
  drafts: ExternalSupportDraft[];
  onChange: (drafts: ExternalSupportDraft[]) => void;
  onContinue: () => void;
  t: (key: string) => string;
};

const SHIFTS = ['MORNING', 'EVENING', 'SPLIT'] as const;

export function ExternalSupportPrompt({ open, drafts, onChange, onContinue, t }: Props) {
  if (!open) return null;

  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  const addRow = () => {
    onChange([
      ...drafts,
      {
        empId: `guest-${drafts.length + 1}`,
        employeeName: '',
        date: '',
        shift: 'EVENING',
      },
    ]);
  };

  const updateRow = (index: number, patch: Partial<ExternalSupportDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeRow = (index: number) => {
    onChange(drafts.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {tr('scheduleNext.supportTitle', 'External support this week?')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {tr(
          'scheduleNext.supportQuestion',
          'Is there external support this week? Add shifts only for periods your team cannot cover.'
        )}
      </p>

      {drafts.length > 0 && (
        <div className="mt-4 space-y-3">
          {drafts.map((row, idx) => (
            <div
              key={`${row.empId}-${idx}`}
              className="grid gap-2 rounded-lg border border-border bg-surface-subtle p-3 sm:grid-cols-4"
            >
              <input
                type="text"
                placeholder={tr('scheduleNext.supportName', 'Employee name')}
                value={row.employeeName}
                onChange={(e) => updateRow(idx, { employeeName: e.target.value, empId: e.target.value || row.empId })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              />
              <input
                type="date"
                value={row.date}
                onChange={(e) => updateRow(idx, { date: e.target.value })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              />
              <select
                value={row.shift}
                onChange={(e) => updateRow(idx, { shift: e.target.value })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="h-9 rounded-md border border-border text-sm text-muted hover:bg-surface"
              >
                {tr('common.remove', 'Remove')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={addRow}
          className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle"
        >
          {tr('scheduleNext.supportAdd', 'Add support shift')}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="h-10 flex-1 rounded-lg border border-[#0F4C3A] bg-[#0F4C3A] px-4 text-sm font-semibold text-white hover:bg-[#0d3f30]"
        >
          {tr('scheduleNext.supportContinue', 'Continue')}
        </button>
      </div>
    </div>
  );
}
