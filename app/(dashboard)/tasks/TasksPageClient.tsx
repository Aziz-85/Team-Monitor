'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { getFirstName } from '@/lib/name';
import type { Role } from '@prisma/client';

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
  const { t } = useT();

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
    (taskId: string, action: 'done' | 'undo', dueDate?: string, assigneeEmpId?: string | null) => {
      if (updatingId) return;
      setUpdatingId(taskId);
      fetch('/api/tasks/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action, dueDate, assigneeEmpId: assigneeEmpId ?? undefined }),
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
          <h1 className="text-xl font-semibold text-foreground">{t('tasks.pageTitle')}</h1>
          {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
              >
                {t('tasks.exportWeeklyPlanner')}
              </button>
              <Link
                href="/tasks/setup"
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
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
            className="w-full max-w-sm rounded border border-border px-3 py-2 text-sm"
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
                period === value ? 'bg-accent text-white' : 'bg-surface-subtle text-foreground hover:bg-surface-subtle'
              }`}
            >
              {t(`tasks.${key}`)}
            </button>
          ))}
        </div>

        {/* Secondary: Status, Assigned */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-muted">{t('tasks.colStatus')}:</span>
          <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
            {(['all', 'open', 'done'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  status === s ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                }`}
              >
                {t(s === 'all' ? 'tasks.statusAll' : s === 'open' ? 'tasks.statusOpen' : 'tasks.statusDone')}
              </button>
            ))}
          </div>
          {canSeeAllAssigned && (
            <>
              <span className="text-sm font-medium text-muted">{t('tasks.colAssignee')}:</span>
              <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
                <button
                  type="button"
                  onClick={() => setAssigned('me')}
                  className={`rounded-md px-2.5 py-1 text-sm ${
                    assigned === 'me' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {t('tasks.assignedMe')}
                </button>
                <button
                  type="button"
                  onClick={() => setAssigned('all')}
                  className={`rounded-md px-2.5 py-1 text-sm ${
                    assigned === 'all' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {t('tasks.assignedAll')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('tasks.colStatus')}
                </th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('tasks.colTitle')}
                </th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('tasks.colAssignee')}
                </th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('tasks.colDueDate')}
                </th>
                <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('tasks.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
              {!loading && tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    {t('tasks.emptyList')}
                  </td>
                </tr>
              )}
              {!loading &&
                tasks.map((row) => {
                  const canToggle = row.isMine || canSeeAllAssigned;
                  return (
                    <tr key={`${row.taskId}-${row.dueDate}`} className="hover:bg-surface-subtle/50">
                      <td className="px-3 py-2.5">
                        {row.isCompleted ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            {t('tasks.done')}
                          </span>
                        ) : isOverdue(row.dueDate) ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            {t('tasks.filterOverdue')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-muted">
                            {t('tasks.statusOpen')}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-3 py-2.5">
                        <span className="line-clamp-2 break-words text-foreground">{row.title}</span>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        {row.assigneeName ? getFirstName(row.assigneeName) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 ${isOverdue(row.dueDate) && !row.isCompleted ? 'font-medium text-red-600' : 'text-foreground'}`}>
                        {formatDDMM(row.dueDate)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {canToggle && (
                            <button
                              type="button"
                              disabled={!!updatingId}
                              onClick={() => toggleCompletion(row.taskId, row.isCompleted ? 'undo' : 'done', row.dueDate, row.assigneeEmpId)}
                              className={
                                row.isCompleted
                                  ? 'rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50'
                                  : 'rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50'
                              }
                            >
                              {updatingId === row.taskId ? '...' : row.isCompleted ? t('tasks.undo') : t('tasks.markDone')}
                            </button>
                          )}
                          {canSeeAllAssigned && (
                            <Link
                              href="/tasks/setup"
                              className="rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle"
                            >
                              {t('tasks.edit')}
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
