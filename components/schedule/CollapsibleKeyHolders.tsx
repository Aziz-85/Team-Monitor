'use client';

import { useMemo, useState } from 'react';

type KeyPlanDay = {
  date: string;
  amHolderEmpId?: string | null;
  pmHolderEmpId?: string | null;
  suggestedAmHolderEmpId?: string | null;
  suggestedPmHolderEmpId?: string | null;
  amEligible?: Array<{ empId: string; name: string }>;
  pmEligible?: Array<{ empId: string; name: string }>;
  warnings?: Array<{ code: string; message: string }>;
};

type Props = {
  keyPlan: {
    weekStart: string;
    currentHolders?: {
      key1HolderName?: string | null;
      key1HolderEmployeeId?: string | null;
      key2HolderName?: string | null;
      key2HolderEmployeeId?: string | null;
    };
    days: KeyPlanDay[];
  };
  keyPlanLocal: KeyPlanDay[];
  keyPlanDirty: boolean;
  keyPlanLoading: boolean;
  canEdit: boolean;
  onLogHandover: () => void;
  onLocalChange: (date: string, field: 'amHolderEmpId' | 'pmHolderEmpId', value: string | null) => void;
  onSave: () => void;
  onCancel: () => void;
  formatDayShort: (date: string) => string;
  formatDate: (date: string) => string;
  t: (key: string) => string;
};

export function CollapsibleKeyHolders({
  keyPlan,
  keyPlanLocal,
  keyPlanDirty,
  keyPlanLoading,
  canEdit,
  onLogHandover,
  onLocalChange,
  onSave,
  onCancel,
  formatDayShort,
  formatDate,
  t,
}: Props) {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    const amSet = keyPlanLocal.filter((d) => d.amHolderEmpId).length;
    const pmSet = keyPlanLocal.filter((d) => d.pmHolderEmpId).length;
    const warnings = keyPlan.days.flatMap((d) => d.warnings ?? []).length;
    const hasSuggestions = keyPlan.days.some((day) => {
      const local = keyPlanLocal.find((x) => x.date === day.date) ?? day;
      const suggestedAm = day.suggestedAmHolderEmpId;
      const suggestedPm = day.suggestedPmHolderEmpId;
      return (
        (!day.amHolderEmpId && suggestedAm && local.amHolderEmpId === suggestedAm) ||
        (!day.pmHolderEmpId && suggestedPm && local.pmHolderEmpId === suggestedPm)
      );
    });
    return { amSet, pmSet, warnings, hasSuggestions };
  }, [keyPlan, keyPlanLocal]);

  if (!keyPlan.days.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {(t('schedule.keys.sectionTitle') as string) || 'Key holders & handover'}
            </span>
            {summary.hasSuggestions && (
              <span
                className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800"
                title={(t('schedule.keys.suggestedBySystem') as string) || 'Suggested by system'}
              >
                {(t('schedule.keys.suggestedBySystem') as string) || 'Suggested by system'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Key #1 → {keyPlan.currentHolders?.key1HolderName ?? '—'} · Key #2 →{' '}
            {keyPlan.currentHolders?.key2HolderName ?? '—'} · AM {summary.amSet}/7 · PM {summary.pmSet}/7
            {summary.warnings > 0 ? ` · ${summary.warnings} warning(s)` : ''}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {keyPlanLoading && <span className="text-xs text-muted">{t('common.loading')}</span>}
            {canEdit && (
              <button
                type="button"
                onClick={onLogHandover}
                className="rounded border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle"
              >
                {t('schedule.keys.logHandover') ?? 'Log handover'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1 pe-2 text-start font-medium text-muted">{t('schedule.day') ?? 'Day'}</th>
                  {keyPlan.days.map((d) => (
                    <th key={d.date} className="py-1 px-1 text-center font-medium text-muted">
                      <span className="inline-flex items-center gap-0.5">
                        {formatDayShort(d.date)} {formatDate(d.date)}
                        {(d.warnings?.length ?? 0) > 0 && (
                          <span
                            title={d.warnings!.map((w) => w.message).join(' • ')}
                            className="text-amber-600"
                            aria-label="Warnings"
                          >
                            ⚠
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-1 pe-2 text-muted">{t('schedule.keys.amHolder') ?? 'AM holder'}</td>
                  {keyPlan.days.map((day) => {
                    const local = keyPlanLocal.find((x) => x.date === day.date) ?? day;
                    const options = day.amEligible ?? [];
                    const suggestedAm = day.suggestedAmHolderEmpId ?? null;
                    const isSuggested =
                      !day.amHolderEmpId && suggestedAm != null && local.amHolderEmpId === suggestedAm;
                    return (
                      <td key={day.date} className="py-1 px-1">
                        <select
                          value={local.amHolderEmpId ?? ''}
                          onChange={(e) => onLocalChange(day.date, 'amHolderEmpId', e.target.value || null)}
                          title={isSuggested ? (t('schedule.keys.suggestedBySystem') as string) : undefined}
                          className="w-full rounded border border-border bg-surface px-1 py-0.5 text-xs"
                        >
                          <option value="">—</option>
                          {options.map((o) => (
                            <option key={o.empId} value={o.empId}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-1 pe-2 text-muted">{t('schedule.keys.pmHolder') ?? 'PM holder'}</td>
                  {keyPlan.days.map((day) => {
                    const local = keyPlanLocal.find((x) => x.date === day.date) ?? day;
                    const options = day.pmEligible ?? [];
                    const suggestedPm = day.suggestedPmHolderEmpId ?? null;
                    const isSuggested =
                      !day.pmHolderEmpId && suggestedPm != null && local.pmHolderEmpId === suggestedPm;
                    return (
                      <td key={day.date} className="py-1 px-1">
                        <select
                          value={local.pmHolderEmpId ?? ''}
                          onChange={(e) => onLocalChange(day.date, 'pmHolderEmpId', e.target.value || null)}
                          title={isSuggested ? (t('schedule.keys.suggestedBySystem') as string) : undefined}
                          className="w-full rounded border border-border bg-surface px-1 py-0.5 text-xs"
                        >
                          <option value="">—</option>
                          {options.map((o) => (
                            <option key={o.empId} value={o.empId}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          {keyPlanDirty && canEdit && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onSave}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                {t('schedule.keys.saveKeyPlan') ?? 'Save key plan'}
              </button>
              <button type="button" onClick={onCancel} className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium">
                {t('common.cancel') ?? 'Cancel'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
