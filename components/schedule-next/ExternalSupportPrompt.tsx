'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ExternalSupportDraft } from '@/lib/schedule-next/types';
import { DAY_NAMES } from '@/lib/schedule-next/types';
import { useT } from '@/lib/i18n/useT';
import { appendBoutiqueContextToApiPath } from '@/lib/scope/clientApiUrl';

type Props = {
  open: boolean;
  drafts: ExternalSupportDraft[];
  weekDates: string[];
  onChange: (drafts: ExternalSupportDraft[]) => void;
  onContinue: () => void;
};

type SourceBoutique = { id: string; name: string; code: string };
type SourceEmployee = { empId: string; name: string; boutiqueName?: string };

const SHIFTS = ['MORNING', 'EVENING', 'SPLIT'] as const;

function formatWeekDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dayName = DAY_NAMES[d.getUTCDay()] ?? '';
  return dayName ? `${dayName} (${dateStr})` : dateStr;
}

export function ExternalSupportPrompt({ open, drafts, weekDates, onChange, onContinue }: Props) {
  const { t } = useT();
  const searchParams = useSearchParams();

  const [sourceBoutiques, setSourceBoutiques] = useState<SourceBoutique[]>([]);
  const [boutiquesLoading, setBoutiquesLoading] = useState(false);
  const [boutiquesError, setBoutiquesError] = useState<string | null>(null);
  const [employeesByBoutique, setEmployeesByBoutique] = useState<Record<string, SourceEmployee[]>>({});
  const [employeesLoading, setEmployeesLoading] = useState<Record<string, boolean>>({});
  const [employeesError, setEmployeesError] = useState<Record<string, string>>({});

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };

  useEffect(() => {
    if (!open) return;
    setBoutiquesLoading(true);
    setBoutiquesError(null);

    const url = appendBoutiqueContextToApiPath(
      '/api/schedule/external-coverage/source-boutiques',
      searchParams
    );

    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          boutiques?: SourceBoutique[];
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
        return data;
      })
      .then((data) => {
        const list = data.boutiques ?? [];
        setSourceBoutiques(list);
        if (list.length === 0) {
          setBoutiquesError(
            tr('schedule.externalCoverageNoBranches', 'No other active branches are available for external coverage.')
          );
        }
      })
      .catch((err: unknown) => {
        setSourceBoutiques([]);
        setBoutiquesError(
          err instanceof Error
            ? err.message
            : tr('schedule.externalCoverageLoadBranchesFailed', 'Failed to load source branches.')
        );
      })
      .finally(() => setBoutiquesLoading(false));
  }, [open, searchParams, t]);

  const loadEmployees = useCallback(
    (boutiqueId: string) => {
      if (!boutiqueId || employeesByBoutique[boutiqueId] !== undefined) return;

      setEmployeesLoading((prev) => ({ ...prev, [boutiqueId]: true }));
      setEmployeesError((prev) => {
        const next = { ...prev };
        delete next[boutiqueId];
        return next;
      });

      const url = appendBoutiqueContextToApiPath(
        `/api/schedule/external-coverage/employees?sourceBoutiqueId=${encodeURIComponent(boutiqueId)}`,
        searchParams
      );

      fetch(url, { cache: 'no-store' })
        .then(async (r) => {
          const data = (await r.json().catch(() => ({}))) as {
            employees?: SourceEmployee[];
            error?: string;
          };
          if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
          return data;
        })
        .then((data) => {
          const list = (data.employees ?? []).map((e) => ({
            empId: e.empId,
            name: e.name,
            boutiqueName: e.boutiqueName ?? '',
          }));
          setEmployeesByBoutique((prev) => ({ ...prev, [boutiqueId]: list }));
        })
        .catch((err: unknown) => {
          setEmployeesByBoutique((prev) => ({ ...prev, [boutiqueId]: [] }));
          setEmployeesError((prev) => ({
            ...prev,
            [boutiqueId]:
              err instanceof Error
                ? err.message
                : tr('schedule.externalCoverageLoadEmployeesFailed', 'Failed to load employees for the selected branch.'),
          }));
        })
        .finally(() => {
          setEmployeesLoading((prev) => ({ ...prev, [boutiqueId]: false }));
        });
    },
    [employeesByBoutique, searchParams, t]
  );

  useEffect(() => {
    if (!open) return;
    for (const row of drafts) {
      if (row.sourceBoutiqueId) loadEmployees(row.sourceBoutiqueId);
    }
  }, [open, drafts, loadEmployees]);

  const defaultDate = weekDates[0] ?? '';
  const defaultBoutiqueId = sourceBoutiques[0]?.id ?? '';

  const addRow = () => {
    onChange([
      ...drafts,
      {
        empId: '',
        employeeName: '',
        date: defaultDate,
        shift: 'EVENING',
        sourceBoutiqueId: defaultBoutiqueId,
      },
    ]);
    if (defaultBoutiqueId) loadEmployees(defaultBoutiqueId);
  };

  const updateRow = (index: number, patch: Partial<ExternalSupportDraft>) => {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    if (patch.sourceBoutiqueId) loadEmployees(patch.sourceBoutiqueId);
  };

  const removeRow = (index: number) => {
    onChange(drafts.filter((_, i) => i !== index));
  };

  const onBoutiqueChange = (index: number, boutiqueId: string) => {
    updateRow(index, {
      sourceBoutiqueId: boutiqueId,
      empId: '',
      employeeName: '',
    });
  };

  const onEmployeeChange = (index: number, empId: string, boutiqueId: string) => {
    const employees = employeesByBoutique[boutiqueId] ?? [];
    const emp = employees.find((e) => e.empId === empId);
    updateRow(index, {
      empId,
      employeeName: emp?.name ?? '',
      sourceBoutiqueId: boutiqueId,
    });
  };

  if (!open) return null;

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

      {boutiquesError && (
        <p className="mt-3 text-sm text-red-600">{boutiquesError}</p>
      )}

      {drafts.length > 0 && (
        <div className="mt-4 space-y-3">
          {drafts.map((row, idx) => {
            const boutiqueId = row.sourceBoutiqueId ?? '';
            const employees = boutiqueId ? employeesByBoutique[boutiqueId] ?? [] : [];
            const empLoading = boutiqueId ? employeesLoading[boutiqueId] : false;
            const empErr = boutiqueId ? employeesError[boutiqueId] : undefined;
            const dateValue = weekDates.includes(row.date) ? row.date : defaultDate;

            return (
              <div
                key={`support-row-${idx}`}
                className="grid gap-2 rounded-lg border border-border bg-surface-subtle p-3 lg:grid-cols-5"
              >
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted">
                    {tr('schedule.sourceBoutique', 'Source boutique')}
                  </span>
                  <select
                    value={boutiqueId}
                    onChange={(e) => onBoutiqueChange(idx, e.target.value)}
                    disabled={boutiquesLoading || sourceBoutiques.length === 0}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">
                      {boutiquesLoading
                        ? tr('common.loading', 'Loading…')
                        : tr('scheduleNext.selectBoutique', 'Select boutique')}
                    </option>
                    {sourceBoutiques.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted">
                    {tr('schedule.employee', 'Employee')}
                  </span>
                  <select
                    value={row.empId}
                    onChange={(e) => onEmployeeChange(idx, e.target.value, boutiqueId)}
                    disabled={!boutiqueId || empLoading}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">
                      {empLoading
                        ? tr('common.loading', 'Loading…')
                        : tr('scheduleNext.selectEmployee', 'Select employee')}
                    </option>
                    {employees.map((e) => (
                      <option key={e.empId} value={e.empId}>
                        {e.empId} — {e.name}
                      </option>
                    ))}
                  </select>
                  {empErr && <span className="text-red-600">{empErr}</span>}
                  {!empLoading && !empErr && boutiqueId && employees.length === 0 && (
                    <span className="text-muted">
                      {tr('schedule.externalCoverageNoEmployees', 'No employees found for this branch.')}
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted">
                    {tr('scheduleNext.supportDate', 'Date')}
                  </span>
                  <select
                    value={dateValue}
                    onChange={(e) => updateRow(idx, { date: e.target.value })}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    {weekDates.map((d) => (
                      <option key={d} value={d}>
                        {formatWeekDayLabel(d)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={dateValue}
                    min={weekDates[0]}
                    max={weekDates[weekDates.length - 1]}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (weekDates.includes(v)) updateRow(idx, { date: v });
                    }}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                    aria-label={tr('scheduleNext.supportDatePicker', 'Pick date from calendar')}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted">
                    {tr('schedule.shift', 'Shift')}
                  </span>
                  <select
                    value={row.shift}
                    onChange={(e) => updateRow(idx, { shift: e.target.value })}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    {SHIFTS.map((s) => (
                      <option key={s} value={s}>
                        {tr(`boutiqueConfig.types.${s}`, s)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="h-9 w-full rounded-md border border-border text-sm text-muted hover:bg-surface"
                  >
                    {tr('scheduleNext.supportRemove', 'Remove')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={addRow}
          disabled={boutiquesLoading || sourceBoutiques.length === 0}
          className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle disabled:opacity-50"
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
