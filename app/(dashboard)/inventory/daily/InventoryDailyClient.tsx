'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { formatBusinessDate } from '@/lib/utils/formatBusinessDate';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type DailyRun = {
  date: string;
  assignedEmpId: string | null;
  assigneeName: string | null;
  status: string;
  effectiveStatus?: string;
  reason: string | null;
  completedByEmpId: string | null;
  completedAt: string | null;
  isMe: boolean;
  canMarkComplete: boolean;
  isManagerOrAdmin?: boolean;
  skips?: Array<{
    empId: string;
    employeeName?: string;
    skipReason: string;
    skipCategory?: 'SHORT' | 'LONG';
    expectedReturnDate?: string | null;
  }>;
  assignmentSource?: 'QUEUE' | 'ROTATION' | 'UNASSIGNED';
  decisionExplanation?: string | null;
  waitingQueue?: Array<{
    empId: string;
    employeeName: string;
    reason: string | null;
    queuedAt: string;
    expiresAt: string;
    lastSkippedDate: string;
  }>;
};

type ExclusionRow = {
  id: string;
  empId: string;
  employeeName: string;
  reason: string | null;
  createdAt: string;
};

type EmployeeOption = { empId: string; name: string };

const SKIP_LABELS: Record<string, string> = {
  LEAVE: 'inventory.skipLeave',
  OFF: 'inventory.skipOff',
  INACTIVE: 'inventory.skipInactive',
  EXCLUDED: 'inventory.skipExcluded',
  EXCLUDED_TODAY: 'inventory.skipExcludedToday',
  ABSENT: 'inventory.skipAbsent',
};

export function InventoryDailyClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [run, setRun] = useState<DailyRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [exclusions, setExclusions] = useState<ExclusionRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [excludeEmpId, setExcludeEmpId] = useState('');
  const [excludeReason, setExcludeReason] = useState('');
  const [savingExclusion, setSavingExclusion] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [absents, setAbsents] = useState<Array<{ id: string; empId: string; empName: string; reason: string | null }>>([]);
  const [absentEmpId, setAbsentEmpId] = useState('');
  const [absentReason, setAbsentReason] = useState('');
  const [savingAbsent, setSavingAbsent] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setRun(data);
      })
      .catch(() => setRun(null))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    if (!run?.isManagerOrAdmin) return;
    fetch(`/api/inventory/daily/exclusions?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setExclusions(data.exclusions ?? []))
      .catch(() => setExclusions([]));
  }, [date, run?.isManagerOrAdmin]);

  useEffect(() => {
    if (!run?.isManagerOrAdmin) return;
    fetch('/api/leaves/employees')
      .then((r) => r.json())
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, [run?.isManagerOrAdmin]);

  useEffect(() => {
    if (!run?.isManagerOrAdmin) return;
    fetch(`/api/inventory/absent?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setAbsents(data.absents ?? []))
      .catch(() => setAbsents([]));
  }, [date, run?.isManagerOrAdmin]);

  const handleAddAbsent = async () => {
    if (!absentEmpId) return;
    setSavingAbsent(true);
    try {
      const res = await fetch('/api/inventory/absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, empId: absentEmpId, reason: absentReason || undefined }),
      });
      if (res.ok) {
        setAbsentEmpId('');
        setAbsentReason('');
        const listRes = await fetch(`/api/inventory/absent?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
        setAbsents(listRes.absents ?? []);
        const runRes = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
        setRun(runRes);
      }
    } finally {
      setSavingAbsent(false);
    }
  };

  const handleRemoveAbsent = async (empId: string) => {
    const res = await fetch(
      `/api/inventory/absent?date=${encodeURIComponent(date)}&empId=${encodeURIComponent(empId)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      const listRes = await fetch(`/api/inventory/absent?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
      setAbsents(listRes.absents ?? []);
      const runRes = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
      setRun(runRes);
    }
  };

  const handleMarkComplete = async () => {
    if (!run?.canMarkComplete) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/inventory/daily/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        const data = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
        setRun(data);
      }
    } finally {
      setCompleting(false);
    }
  };

  const handleAddExclusion = async () => {
    if (!excludeEmpId) return;
    setSavingExclusion(true);
    try {
      const res = await fetch('/api/inventory/daily/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, empId: excludeEmpId, reason: excludeReason || undefined }),
      });
      const data = await res.json();
      if (data.exclusions != null) setExclusions(data.exclusions);
      if (res.ok) {
        setExcludeEmpId('');
        setExcludeReason('');
        const runRes = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
        setRun(runRes);
      }
    } finally {
      setSavingExclusion(false);
    }
  };

  const handleRemoveExclusion = async (empId: string) => {
    const res = await fetch(
      `/api/inventory/daily/exclusions?date=${encodeURIComponent(date)}&empId=${encodeURIComponent(empId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (data.exclusions != null) setExclusions(data.exclusions);
    if (res.ok) {
      const runRes = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
      setRun(runRes);
    }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const res = await fetch('/api/inventory/daily/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        const runRes = await fetch(`/api/inventory/daily?date=${date}`, { cache: 'no-store' }).then((r) => r.json());
        setRun(runRes);
      }
    } finally {
      setRecomputing(false);
    }
  };

  const effective = run?.effectiveStatus ?? run?.status;
  const statusLabel =
    effective === 'COMPLETED'
      ? t('inventory.completed')
      : effective === 'LATE'
        ? t('inventory.late')
        : run?.status === 'UNASSIGNED'
          ? t('inventory.unassigned')
          : t('inventory.pending');

  const copyDailyReminder = () => {
    const text = t('inventory.dailyReminderText');
    navigator.clipboard.writeText(text).then(() => {}, () => {});
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-3 overflow-x-auto pb-1">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
          />
          <Link href="/inventory/zones" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10 inline-flex items-center">
            {t('inventory.zones')}
          </Link>
          {run?.isManagerOrAdmin && (
            <Link href="/inventory/daily/history" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10 inline-flex items-center">
              {t('inventory.history')}
            </Link>
          )}
        </div>

        {loading && <p className="text-slate-600">{t('common.loading')}</p>}
        {!loading && run && (
          <OpsCard title={t('inventory.todayCard')}>
            <dl className="space-y-2 text-base">
              <div>
                <dt className="font-medium text-slate-700">{t('inventory.assignee')}</dt>
                <dd className="text-slate-900">
                  {run.assigneeName ?? '—'}
                  {run.isMe && run.assignedEmpId && (
                    <span className="ml-2 text-sm text-sky-600">({t('inventory.isMe')})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">{t('inventory.status')}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                      effective === 'COMPLETED'
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                        : effective === 'LATE'
                          ? 'border-red-200 bg-red-100 text-red-900'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                    }`}
                  >
                    {statusLabel}
                  </span>
                  {run.assignmentSource && (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                        run.assignmentSource === 'QUEUE'
                          ? 'border-purple-200 bg-purple-100 text-purple-900'
                          : run.assignmentSource === 'ROTATION'
                            ? 'border-sky-200 bg-sky-100 text-sky-900'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    >
                      {run.assignmentSource === 'QUEUE'
                        ? t('inventory.sourceQueue')
                        : run.assignmentSource === 'ROTATION'
                          ? t('inventory.sourceRotation')
                          : t('inventory.sourceUnassigned')}
                    </span>
                  )}
                  {(effective === 'PENDING' || effective === 'LATE') && (
                    <button
                      type="button"
                      onClick={copyDailyReminder}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      {t('inventory.copyReminder')}
                    </button>
                  )}
                </dd>
              </div>
              {run.status === 'UNASSIGNED' && run.reason && (
                <div>
                  <dt className="font-medium text-amber-700">{t('inventory.noAssignee')}</dt>
                  <dd className="text-amber-800">{run.reason}</dd>
                </div>
              )}
              {run.decisionExplanation && (
                <div>
                  <dt className="font-medium text-slate-700">
                    {t('inventory.assignmentExplanation')}
                  </dt>
                  <dd className="text-sm text-slate-700">{run.decisionExplanation}</dd>
                </div>
              )}
            </dl>
            {run.canMarkComplete && run.status !== 'COMPLETED' && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleMarkComplete}
                  disabled={completing}
                  className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10"
                >
                  {completing ? '…' : t('inventory.markCompleted')}
                </button>
              </div>
            )}
            {run.isManagerOrAdmin && run.skips && run.skips.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4 space-y-3">
                {(() => {
                  const shortSkips = run.skips!.filter((s) => s.skipCategory !== 'LONG');
                  const longSkips = run.skips!.filter((s) => s.skipCategory === 'LONG');
                  return (
                    <>
                      {shortSkips.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700">
                            {t('inventory.skippedShortAbsences')}
                          </h3>
                          <ul className="mt-1 space-y-1 text-sm text-slate-600">
                            {shortSkips.map((s) => (
                              <li key={`${s.empId}-${s.skipReason}`}>
                                <span className="font-medium text-slate-800">
                                  {s.employeeName ?? s.empId}
                                </span>
                                <span className="ml-1 text-slate-500">
                                  – {t(SKIP_LABELS[s.skipReason])}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {longSkips.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700">
                            {t('inventory.skippedLongAbsences')}
                          </h3>
                          <ul className="mt-1 space-y-1 text-sm text-slate-600">
                            {longSkips.map((s) => (
                              <li key={`${s.empId}-${s.skipReason}`}>
                                <span className="font-medium text-slate-800">
                                  {s.employeeName ?? s.empId}
                                </span>
                                <span className="ml-1 text-slate-500">
                                  – {t(SKIP_LABELS[s.skipReason])}
                                </span>
                                {s.expectedReturnDate && (
                                  <span className="ml-2 text-xs text-slate-500">
                                    ({t('inventory.expectedReturn')} {s.expectedReturnDate})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </OpsCard>
        )}

        {run?.isManagerOrAdmin && (
          <>
          <OpsCard title={t('inventory.excludeToday')} className="mt-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-600">{t('inventory.excludeEmployee')}</label>
                  <select
                    value={excludeEmpId}
                    onChange={(e) => setExcludeEmpId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                  >
                    <option value="">—</option>
                    {employees
                      .filter((emp) => !exclusions.some((x) => x.empId === emp.empId))
                      .map((emp) => (
                        <option key={emp.empId} value={emp.empId}>
                          {emp.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.reason')}</label>
                  <input
                    type="text"
                    value={excludeReason}
                    onChange={(e) => setExcludeReason(e.target.value)}
                    placeholder={t('inventory.absentOptional')}
                    className="h-9 w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddExclusion}
                  disabled={!excludeEmpId || savingExclusion}
                  className="h-9 rounded-lg bg-slate-600 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10"
                >
                  {savingExclusion ? '…' : t('common.save')}
                </button>
              </div>
              {exclusions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700">{t('inventory.todaysExclusions')}</h4>
                  <ul className="mt-1 space-y-1">
                    {exclusions.map((x) => (
                      <li key={x.id} className="flex items-center gap-2 text-sm text-slate-800">
                        <span>{x.employeeName}</span>
                        {x.reason && <span className="text-slate-500">({x.reason})</span>}
                        <button
                          type="button"
                          onClick={() => handleRemoveExclusion(x.empId)}
                          className="text-sky-600 hover:underline"
                        >
                          {t('inventory.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
              {run && run.status !== 'COMPLETED' && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={handleRecompute}
                  disabled={recomputing}
                  className="h-9 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 md:h-10"
                >
                  {recomputing ? '…' : t('inventory.recomputeAssignee')}
                </button>
                <p className="mt-1 text-xs text-slate-500">{t('inventory.recomputeHint')}</p>
              </div>
            )}
          </OpsCard>

            <OpsCard title={t('inventory.absentForToday')} className="mt-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-600">{t('inventory.excludeEmployee')}</label>
                  <select
                    value={absentEmpId}
                    onChange={(e) => setAbsentEmpId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                  >
                    <option value="">—</option>
                    {employees
                      .filter((emp) => !absents.some((a) => a.empId === emp.empId))
                      .map((emp) => (
                        <option key={emp.empId} value={emp.empId}>
                          {emp.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.reason')}</label>
                  <input
                    type="text"
                    value={absentReason}
                    onChange={(e) => setAbsentReason(e.target.value)}
                    placeholder={t('inventory.absentOptional')}
                    className="h-9 w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddAbsent}
                  disabled={!absentEmpId || savingAbsent}
                  className="h-9 rounded-lg bg-slate-600 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10"
                >
                  {savingAbsent ? '…' : t('inventory.addAbsent')}
                </button>
              </div>
              {absents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700">{t('inventory.absentForToday')}</h4>
                  <ul className="mt-1 space-y-1">
                    {absents.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm text-slate-800">
                        <span>{a.empName}</span>
                        {a.reason && <span className="text-slate-500">({a.reason})</span>}
                        <button
                          type="button"
                          onClick={() => handleRemoveAbsent(a.empId)}
                          className="text-sky-600 hover:underline"
                        >
                          {t('inventory.removeAbsent')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            </OpsCard>

            {run.waitingQueue && run.waitingQueue.length > 0 && (
              <OpsCard title={t('inventory.waitingQueue')} className="mt-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-700">
                        <th className="px-2 py-1.5">{t('common.name')}</th>
                        <th className="px-2 py-1.5">{t('common.reason')}</th>
                        <th className="px-2 py-1.5">{t('inventory.queueSince')}</th>
                        <th className="px-2 py-1.5">{t('inventory.queueExpires')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.waitingQueue.map((q) => (
                        <tr key={`${q.empId}-${q.queuedAt}`} className="border-b border-slate-100">
                          <td className="px-2 py-1.5 text-slate-800">{q.employeeName}</td>
                          <td className="px-2 py-1.5 text-slate-600">{q.reason ?? '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {formatBusinessDate(q.queuedAt)}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {formatBusinessDate(q.expiresAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </OpsCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
