'use client';

import { useCallback, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import { getScheduleDisplayName } from '@/lib/schedule/displayName';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type GridDay = { date: string; dayName: string; dayOfWeek: number };

type EmployeeRow = {
  empId: string;
  name: string;
  nameAr?: string | null;
  effectiveWeeklyOffDay?: number | 'NONE';
};

type Props = {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  days: GridDay[];
  rows: EmployeeRow[];
  scheduleDisplayNames?: Map<string, string>;
  onSuccess: () => void;
};

function formatDayOption(date: string, dayOfWeek: number, locale: string): string {
  const label = DAY_KEYS[dayOfWeek] ?? 'day';
  const short = new Date(date + 'T12:00:00.000Z').toLocaleDateString(
    locale === 'ar' ? 'ar-SA' : 'en-GB',
    { day: '2-digit', month: '2-digit' }
  );
  return `${label.toUpperCase()} · ${short}`;
}

export function SwapWeeklyOffModal({
  open,
  onClose,
  weekStart,
  days,
  rows,
  scheduleDisplayNames,
  onSuccess,
}: Props) {
  const { t, locale } = useT();
  const [employeeId, setEmployeeId] = useState('');
  const [newOffDayOfWeek, setNewOffDayOfWeek] = useState<number>(() => days[0]?.dayOfWeek ?? 0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEmployee = useMemo(
    () => rows.find((r) => r.empId === employeeId),
    [rows, employeeId]
  );

  const regularOffLabel = useMemo(() => {
    const off = selectedEmployee?.effectiveWeeklyOffDay;
    if (off == null || off === 'NONE') {
      return (t('schedule.swapWeeklyOff.noRegularOff') as string) || 'No regular weekly off';
    }
    const key = DAY_KEYS[off];
    return key ? (t(`days.${key}`) as string) : String(off);
  }, [selectedEmployee, t]);

  const handleApply = useCallback(async () => {
    if (!employeeId) {
      setError((t('schedule.swapWeeklyOff.pickEmployee') as string) || 'Select an employee');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schedule/week/swap-weekly-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          weekStart,
          newOffDayOfWeek,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data.error as string) || `Failed (${res.status})`);
      }
      onSuccess();
      onClose();
      setEmployeeId('');
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [employeeId, newOffDayOfWeek, onClose, onSuccess, reason, t, weekStart]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => !loading && onClose()} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h3 className="text-lg font-semibold text-foreground">
          {t('schedule.swapWeeklyOff.title')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('schedule.swapWeeklyOff.subtitle')}</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">{t('schedule.swapWeeklyOff.employee')}</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={loading}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="">{t('schedule.swapWeeklyOff.pickEmployee')}</option>
              {rows.map((row) => (
                <option key={row.empId} value={row.empId}>
                  {getScheduleDisplayName(
                    row.empId,
                    getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale),
                    scheduleDisplayNames ?? new Map()
                  )}
                </option>
              ))}
            </select>
          </label>

          {selectedEmployee && (
            <p className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-foreground">
              {t('schedule.swapWeeklyOff.regularOff')}: <span className="font-medium">{regularOffLabel}</span>
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted">{t('schedule.swapWeeklyOff.newOffThisWeek')}</span>
            <select
              value={newOffDayOfWeek}
              onChange={(e) => setNewOffDayOfWeek(Number(e.target.value))}
              disabled={loading}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            >
              {days.map((day) => (
                <option key={day.date} value={day.dayOfWeek}>
                  {formatDayOption(day.date, day.dayOfWeek, locale)} —{' '}
                  {t(`days.${DAY_KEYS[day.dayOfWeek]}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted">{t('common.reason')}</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              placeholder={t('schedule.swapWeeklyOff.reasonPlaceholder') as string}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-9 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={loading || !employeeId}
            className="h-9 rounded-lg bg-[#0F4C3A] px-4 text-sm font-semibold text-white hover:bg-[#0c3d2f] disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('schedule.swapWeeklyOff.apply')}
          </button>
        </div>
      </div>
    </>
  );
}
