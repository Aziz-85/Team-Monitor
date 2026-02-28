'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { getFirstName } from '@/lib/name';
import type { Role } from '@prisma/client';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type TaskListRow = {
  taskId: string;
  title: string;
  dueDate: string;
  assigneeName: string | null;
  assigneeEmpId: string | null;
  isCompleted: boolean;
  isMine: boolean;
  reason: string;
};

function formatDDMM(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d ?? ''}/${m ?? ''}`;
}

export function TasksPageClient({ role }: { role: Role }) {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const [period, setPeriod] = useState<'today' | 'week' | 'overdue' | 'all'>('today');
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('all');
  const [assigned, setAssigned] = useState<'me' | 'all'>(role === 'EMPLOYEE' ? 'me' : 'me');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [tasks, setTasks] = useState<TaskListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const canSeeAllAssigned = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/export-weekly');
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'weekly-tasks.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // swallow; export is best-effort
    }
  }, []);

  const fetchList = useCallback(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    params.set('status', status);
    params.set('assigned', assigned);
    if (searchDebounced) params.set('search', searchDebounced);
    setLoading(true);
    fetch(`/api/tasks/list?${params}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((data: { tasks?: TaskListRow[] } | null) => {
        setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [period, status, assigned, searchDebounced]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const toggleCompletion = useCallback(
    (taskId: string, action: 'done' | 'undo') => {
      if (updatingId) return;
      setUpdatingId(taskId);
      fetch('/api/tasks/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      })
        .then((r) => {
          if (r.ok) fetchList();
        })
        .finally(() => setUpdatingId(null));
    },
    [updatingId, fetchList]
  );

  const todayStr = (() => {
    const now = new Date();
    const ksa = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const y = ksa.getFullYear();
    const m = String(ksa.getMonth() + 1).padStart(2, '0');
    const d = String(ksa.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const isOverdue = (dueDate: string) => dueDate < todayStr;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header: title + primary action */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{t('tasks.pageTitle')}</h1>
          {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {t('tasks.exportWeeklyPlanner')}
              </button>
              <Link
                href="/tasks/setup"
                className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {t('tasks.addTask')}
              </Link>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tasks.searchPlaceholder')}
            className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
            aria-label={t('tasks.searchPlaceholder')}
          />
        </div>

        {/* Filter pills: Today / This Week / Overdue / All */}
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['today', 'filterToday'],
              ['week', 'filterThisWeek'],
              ['overdue', 'filterOverdue'],
              ['all', 'filterAll'],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                period === value ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t(`tasks.${key}`)}
            </button>
          ))}
        </div>

        {/* Secondary: Status, Assigned */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-slate-600">{t('tasks.colStatus')}:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['all', 'open', 'done'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  status === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(s === 'all' ? 'tasks.statusAll' : s === 'open' ? 'tasks.statusOpen' : 'tasks.statusDone')}
              </button>
            ))}
          </div>
          {canSeeAllAssigned && (
            <>
              <span className="text-sm font-medium text-slate-600">{t('tasks.colAssignee')}:</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setAssigned('me')}
                  className={`rounded-md px-2.5 py-1 text-sm ${
                    assigned === 'me' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('tasks.assignedMe')}
                </button>
                <button
                  type="button"
                  onClick={() => setAssigned('all')}
                  className={`rounded-md px-2.5 py-1 text-sm ${
                    assigned === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('tasks.assignedAll')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-800">
                  {t('tasks.colStatus')}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-800">
                  {t('tasks.colTitle')}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-800">
                  {t('tasks.colAssignee')}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-800">
                  {t('tasks.colDueDate')}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-800">
                  {t('tasks.colActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="border border-slate-200 px-2 py-4 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
              {!loading && tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="border border-slate-200 px-2 py-6 text-center text-slate-500">
                    {t('tasks.emptyList')}
                  </td>
                </tr>
              )}
              {!loading &&
                tasks.map((row) => (
                  <tr key={`${row.taskId}-${row.dueDate}`} className="border-b border-slate-200">
                    <td className="border border-slate-200 px-2 py-2">
                      {row.isCompleted ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          {t('tasks.done')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {t('tasks.statusOpen')}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] border border-slate-200 px-2 py-2">
                      <span className="line-clamp-2 break-words text-slate-900">{row.title}</span>
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-slate-700">
                      {row.assigneeName ? getFirstName(row.assigneeName) : '—'}
                    </td>
                    <td
                      className={`border border-slate-200 px-2 py-2 ${isOverdue(row.dueDate) ? 'font-medium text-red-600' : 'text-slate-700'}`}
                    >
                      {formatDDMM(row.dueDate)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.isMine && row.dueDate === todayStr && (
                          <button
                            type="button"
                            disabled={!!updatingId}
                            onClick={() => toggleCompletion(row.taskId, row.isCompleted ? 'undo' : 'done')}
                            className={
                              row.isCompleted
                                ? 'rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                                : 'rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50'
                            }
                          >
                            {updatingId === row.taskId ? t('common.loading') : row.isCompleted ? t('tasks.undo') : t('tasks.markDone')}
                          </button>
                        )}
                        {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
                          <Link
                            href="/tasks/setup"
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {t('tasks.edit')}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
