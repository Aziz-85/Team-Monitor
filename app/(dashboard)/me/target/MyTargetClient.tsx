'use client';

import { useEffect, useState, useMemo } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { formatSarFromHalala } from '@/lib/utils/money';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

/** Add delta months to YYYY-MM. Returns YYYY-MM. */
function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  let month = m + delta;
  let year = y;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Day-of-week for Riyadh: 0=Sat, 1=Sun, ..., 6=Fri. */
function riyadhDayOfWeek(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  return (d.getUTCDay() + 1) % 7;
}

function getDaysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Format YYYY-MM-DD for a day in month. */
function dateStrInMonth(monthKey: string, day: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Add delta days to YYYY-MM-DD. Returns YYYY-MM-DD. */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Month key from YYYY-MM-DD. */
function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

type TargetsData = {
  monthKey: string;
  monthTarget: number;
  dailyTarget: number;
  weekTarget: number;
  todaySales: number;
  mtdSales: number;
  weekSales: number;
  pctMonth: number;
  pctDaily: number;
  pctWeek: number;
  remaining: number;
  daysInMonth: number;
  todayStr: string;
  todayInSelectedMonth?: boolean;
  weekRangeLabel?: string;
  leaveDaysInMonth?: number | null;
  presenceFactor?: number | null;
  scheduledDaysInMonth?: number | null;
};

type SalesEntry = { id: string; date: string; amount: number; canEdit: boolean };

const WEEKDAY_LABELS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function MyTargetClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<TargetsData | null>(null);
  const [monthEntries, setMonthEntries] = useState<SalesEntry[]>([]);
  const [canEditDates, setCanEditDates] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState<{ id: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [requestEditSuccess, setRequestEditSuccess] = useState(false);
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingMonth, setClearingMonth] = useState(false);

  const entriesByDate = useMemo(() => {
    const map: Record<string, SalesEntry> = {};
    monthEntries.forEach((e) => {
      map[e.date] = e;
    });
    return map;
  }, [monthEntries]);

  const pendingDates = useMemo(() => new Set(pendingRequests.map((r) => r.date)), [pendingRequests]);
  const canEditSelected = canEditDates.includes(date);

  const loadTargets = () => {
    setApiError(null);
    fetch(`/api/metrics/my-target?month=${month}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (ok) setData(body);
        else {
          setData(null);
          setApiError(typeof body?.error === 'string' ? body.error : 'Failed to load targets');
        }
      })
      .catch(() => {
        setData(null);
        setApiError('Failed to load targets');
      });
  };
  const loadMonthEntries = () => {
    fetch(`/api/me/sales?month=${month}`)
      .then((r) => r.json())
      .then((d: { mode?: string; entries?: SalesEntry[]; canEditDates?: string[] }) => {
        if (d.mode === 'month' && Array.isArray(d.entries)) setMonthEntries(d.entries);
        else setMonthEntries([]);
        setCanEditDates(Array.isArray(d.canEditDates) ? d.canEditDates : []);
      })
      .catch(() => {
        setMonthEntries([]);
        setCanEditDates([]);
      });
  };
  const loadRequests = () => {
    fetch(`/api/me/sales/requests?month=${month}`)
      .then((r) => r.json())
      .then((d: { requests?: { id: string; date: string }[] }) => setPendingRequests(d.requests ?? []))
      .catch(() => setPendingRequests([]));
  };

  useEffect(() => {
    setLoading(true);
    loadTargets();
    loadMonthEntries();
    loadRequests();
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when month changes
  }, [month]);

  useEffect(() => {
    if (monthKeyFromDate(date) !== month) setDate(`${month}-01`);
  }, [month, date]);

  const refresh = () => {
    loadTargets();
    loadMonthEntries();
    loadRequests();
  };

  const requestEdit = async () => {
    setRequestingEdit(true);
    setRequestEditSuccess(false);
    try {
      const res = await fetch('/api/me/sales/request-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        loadRequests();
        loadMonthEntries();
        setRequestEditSuccess(true);
        setTimeout(() => setRequestEditSuccess(false), 3000);
      }
    } finally {
      setRequestingEdit(false);
    }
  };

  const goPrevMonth = () => setMonth((m) => addMonths(m, -1));
  const goNextMonth = () => setMonth((m) => addMonths(m, 1));
  const goThisMonth = () => setMonth(new Date().toISOString().slice(0, 7));

  const goPrevDay = () => {
    const prev = addDays(date, -1);
    setDate(prev);
    if (monthKeyFromDate(prev) !== month) setMonth(monthKeyFromDate(prev));
  };
  const goNextDay = () => {
    const next = addDays(date, 1);
    setDate(next);
    if (monthKeyFromDate(next) !== month) setMonth(monthKeyFromDate(next));
  };
  const goToday = () => {
    const today = data?.todayStr ?? new Date().toISOString().slice(0, 10);
    setDate(today);
    setMonth(monthKeyFromDate(today));
  };

  const selectDay = (dateStr: string) => {
    setDate(dateStr);
    const e = entriesByDate[dateStr];
    setAmount(e ? String(e.amount) : '');
  };

  useEffect(() => {
    const e = entriesByDate[date];
    setAmount(e ? String(e.amount) : '');
  }, [date, entriesByDate]);

  const submitSales = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(amount));
    if (amt < 0 || !Number.isFinite(amt)) return;
    setSubmitting(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/me/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, amount: amt }),
      });
      if (res.ok) {
        setAmount('');
        refresh();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/me/sales/${id}`, { method: 'DELETE' });
      if (res.ok) refresh();
    } finally {
      setDeletingId(null);
    }
  };

  const formatMoney = (n: number) => (Number.isFinite(n) ? formatSarFromHalala(n) : '—');
  const formatPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');

  const progress = (pct: number) => Math.min(100, Math.max(0, pct));

  if (loading && !data) {
    return (
      <div className="p-4">
        <p className="text-slate-600">{t('common.loading')}</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="p-4">
        <p className="text-amber-700">{apiError}</p>
        <button
          type="button"
          onClick={() => { setApiError(null); loadTargets(); }}
          className="mt-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('common.retry') ?? 'Retry'}
        </button>
      </div>
    );
  }

  const d = data ?? {
    monthKey: month,
    monthTarget: 0,
    dailyTarget: 0,
    weekTarget: 0,
    todaySales: 0,
    mtdSales: 0,
    weekSales: 0,
    pctMonth: 0,
    pctDaily: 0,
    pctWeek: 0,
    remaining: 0,
    daysInMonth: 30,
    todayStr: '',
    todayInSelectedMonth: false,
    weekRangeLabel: '',
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">{t('targets.myTargetTitle')}</h1>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={goNextMonth}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Next month"
          >
            →
          </button>
          <button
            type="button"
            onClick={goThisMonth}
            className="rounded border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {t('targets.thisMonth')}
          </button>
        </div>

        {data && (data.scheduledDaysInMonth != null || data.leaveDaysInMonth != null) && (
          <p className="mb-4 text-xs text-slate-500">
            {t('targets.presenceInfo')}
            {data.scheduledDaysInMonth != null && ` ${data.scheduledDaysInMonth} ${t('targets.scheduledDays')}`}
            {data.leaveDaysInMonth != null && data.leaveDaysInMonth > 0 && `, ${data.leaveDaysInMonth} ${t('targets.leaveDays')}`}
            {data.presenceFactor != null && data.presenceFactor < 1 && ` (${(data.presenceFactor * 100).toFixed(0)}% ${t('targets.presenceFactor')})`}.
          </p>
        )}

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <OpsCard title={t('targets.todayProgress')}>
            {d.todayInSelectedMonth === false && (
              <p className="mb-2 text-xs text-amber-700">{t('targets.notInSelectedMonth')}</p>
            )}
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="p-1 text-slate-600">{t('targets.target')}</td><td className="p-1 text-right font-medium">{formatMoney(d.dailyTarget)}</td></tr>
                <tr><td className="p-1 text-slate-600">{t('targets.sales')}</td><td className="p-1 text-right font-medium">{formatMoney(d.todaySales)}</td></tr>
                <tr><td className="p-1 text-slate-600">%</td><td className="p-1 text-right font-medium">{formatPct(d.pctDaily)}</td></tr>
              </tbody>
            </table>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${progress(d.pctDaily)}%` }} />
            </div>
          </OpsCard>

          <OpsCard title={t('targets.weekProgress')}>
            {d.weekRangeLabel && <p className="mb-2 text-xs text-slate-500">{d.weekRangeLabel}</p>}
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="p-1 text-slate-600">{t('targets.target')}</td><td className="p-1 text-right font-medium">{formatMoney(d.weekTarget)}</td></tr>
                <tr><td className="p-1 text-slate-600">{t('targets.sales')}</td><td className="p-1 text-right font-medium">{formatMoney(d.weekSales)}</td></tr>
                <tr><td className="p-1 text-slate-600">%</td><td className="p-1 text-right font-medium">{formatPct(d.pctWeek)}</td></tr>
              </tbody>
            </table>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progress(d.pctWeek)}%` }} />
            </div>
          </OpsCard>

          <OpsCard title={t('targets.monthProgress')}>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="p-1 text-slate-600">{t('targets.target')}</td><td className="p-1 text-right font-medium">{formatMoney(d.monthTarget)}</td></tr>
                <tr><td className="p-1 text-slate-600">MTD</td><td className="p-1 text-right font-medium">{formatMoney(d.mtdSales)}</td></tr>
                <tr><td className="p-1 text-slate-600">%</td><td className="p-1 text-right font-medium">{formatPct(d.pctMonth)}</td></tr>
                <tr><td className="p-1 text-slate-600">{t('targets.remaining')}</td><td className="p-1 text-right font-medium">{formatMoney(d.remaining)}</td></tr>
              </tbody>
            </table>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress(d.pctMonth)}%` }} />
            </div>
          </OpsCard>
        </div>

        <OpsCard title={t('targets.enterSales')} className="mb-4">
          <p className="mb-2 text-xs text-slate-500">{t('targets.salesEntryPolicyTooltip')}</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goPrevDay}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Previous day"
            >
              ←
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                const v = e.target.value;
                setDate(v);
                if (monthKeyFromDate(v) !== month) setMonth(monthKeyFromDate(v));
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={goNextDay}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Next day"
            >
              →
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              {t('targets.today')}
            </button>
          </div>
          <form onSubmit={submitSales} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('targets.amount')}</label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !canEditSelected}
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canEditSelected ? t('targets.salesEntryPolicyTooltip') : undefined}
            >
              {submitting ? t('common.loading') : t('common.save')}
            </button>
            {saveSuccess && <span className="py-2 text-sm text-emerald-600">{t('targets.saved')}</span>}
            {!canEditSelected && !pendingDates.has(date) && (
              <button
                type="button"
                onClick={requestEdit}
                disabled={requestingEdit}
                className="rounded border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {requestingEdit ? t('common.loading') : t('targets.requestEdit')}
              </button>
            )}
            {pendingDates.has(date) && (
              <span className="py-2 text-sm text-amber-600">{t('targets.editPending')}</span>
            )}
            {requestEditSuccess && <span className="py-2 text-sm text-emerald-600">{t('targets.requestSubmitted')}</span>}
          </form>
        </OpsCard>

        <OpsCard title={t('targets.monthCalendar')} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] table-fixed border-collapse text-center text-sm">
              <thead>
                <tr>
                  {WEEKDAY_LABELS.map((w) => (
                    <th key={w} className="border border-slate-200 p-1 font-medium text-slate-600">{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const daysInMonth = getDaysInMonth(month);
                  const [y, m] = month.split('-').map(Number);
                  const firstCol = riyadhDayOfWeek(y, m, 1);
                  const today = data?.todayStr ?? '';
                  const rows: { day: number; dateStr: string }[][] = [];
                  let row: { day: number; dateStr: string }[] = Array(7).fill(null);
                  let col = firstCol;
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = dateStrInMonth(month, day);
                    row[col] = { day, dateStr };
                    col += 1;
                    if (col === 7) {
                      rows.push(row);
                      row = Array(7).fill(null);
                      col = 0;
                    }
                  }
                  if (col > 0) rows.push(row);
                  return rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((cell, ci) => {
                        if (!cell) return <td key={ci} className="border border-slate-100 p-1" />;
                        const entry = entriesByDate[cell.dateStr];
                        const isSelected = date === cell.dateStr;
                        const isToday = today === cell.dateStr;
                        const isPending = pendingDates.has(cell.dateStr);
                        return (
                          <td key={ci} className="border border-slate-200 p-1">
                            <button
                              type="button"
                              onClick={() => selectDay(cell.dateStr)}
                              className={`min-h-[2.5rem] w-full rounded border text-left transition ${
                                isSelected
                                  ? 'border-sky-500 bg-sky-50 font-medium'
                                  : isToday
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-transparent hover:bg-slate-100'
                              }`}
                            >
                              <span className="block text-xs text-slate-500">{cell.day}</span>
                              {entry ? (
                                <span className="block font-medium text-slate-800">{formatMoney(entry.amount)}</span>
                              ) : (
                                <span className="block text-xs text-slate-400">—</span>
                              )}
                              {isPending && (
                                <span className="block text-[10px] text-amber-600">{t('targets.editPending')}</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>{t('targets.enteredDays')}: {monthEntries.length} / {getDaysInMonth(month)}</span>
            <span>{t('targets.missingDays')}: {Math.max(0, getDaysInMonth(month) - monthEntries.length)}</span>
            <span className="font-medium">{t('targets.monthTotal')}: {formatMoney(monthEntries.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </OpsCard>

        <OpsCard title={t('targets.thisMonthEntries')}>
          {monthEntries.length > 0 && (() => {
            const isCurrentMonth = month === new Date().toISOString().slice(0, 7);
            return (
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                {isCurrentMonth ? (
                  <span className="text-sm text-slate-500" title={t('targets.cannotClearCurrentMonth')}>
                    {t('targets.cannotClearCurrentMonth')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(t('targets.clearMyMonthEntriesConfirm'))) return;
                      setClearingMonth(true);
                      try {
                        const res = await fetch(`/api/me/sales?month=${encodeURIComponent(month)}`, {
                          method: 'DELETE',
                        });
                        if (res.ok) refresh();
                        else {
                          const j = await res.json().catch(() => ({}));
                          if (j.error) alert(j.error);
                        }
                      } finally {
                        setClearingMonth(false);
                      }
                    }}
                    disabled={clearingMonth}
                    className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {clearingMonth ? t('common.loading') : t('targets.clearMyMonthEntries')}
                  </button>
                )}
              </div>
            );
          })()}
          <ul className="space-y-2">
            {monthEntries.length === 0 && <li className="text-slate-500">—</li>}
                {monthEntries
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) => {
                const isCurrentMonth = month === new Date().toISOString().slice(0, 7);
                const canDeleteEntry = e.canEdit && !isCurrentMonth;
                return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  title={!e.canEdit ? t('targets.salesEntryPolicyTooltip') : isCurrentMonth ? t('targets.cannotClearCurrentMonth') : undefined}
                >
                  <span className={!e.canEdit ? 'text-slate-500' : ''}>
                    {e.date} — {formatMoney(e.amount)}
                    {!e.canEdit && (
                      <span className="ml-1 text-xs text-slate-400" title={t('targets.salesEntryPolicyTooltip')}>
                        (read-only)
                      </span>
                    )}
                  </span>
                  {canDeleteEntry ? (
                    <button
                      type="button"
                      onClick={() => deleteEntry(e.id)}
                      disabled={deletingId === e.id}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      {deletingId === e.id ? t('common.loading') : t('common.delete')}
                    </button>
                  ) : isCurrentMonth ? (
                    <span className="text-xs text-slate-400">{t('targets.cannotClearCurrentMonth')}</span>
                  ) : null}
                </li>
              );
              })}
          </ul>
        </OpsCard>
      </div>
    </div>
  );
}
