'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { EmployeeSelect, type EmployeeOption } from '@/components/EmployeeSelect';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type TaskScheduleRow = {
  id: string;
  type: string;
  weeklyDays: number[];
  monthlyDay: number | null;
  isLastDay: boolean;
};

type Task = {
  id: string;
  name: string;
  active: boolean;
  taskPlans: Array<{
    primary: { empId: string; name: string };
    backup1: { empId: string; name: string };
    backup2: { empId: string; name: string };
  }>;
  taskSchedules: TaskScheduleRow[];
};

const WEEKLY_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const; // 0=Sun .. 6=Sat

export function TaskSetupClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [modalOpen, setModalOpen] = useState<'add' | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    frequency: 'DAILY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    weeklyDays: [] as number[],
    monthlyDay: 1,
    isLastDay: false,
    primaryEmpId: '',
    backup1EmpId: '',
    backup2EmpId: '',
  });

  const loadTasks = () => {
    fetch('/api/tasks/setup')
      .then((r) => r.json().catch(() => []))
      .then((data) => setTasks(Array.isArray(data) ? data : []))
      .catch(() => setTasks([]));
  };

  const loadEmployees = () => {
    fetch('/api/leaves/employees')
      .then((r) => r.json().catch(() => []))
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]));
  };

  useEffect(loadTasks, []);
  useEffect(loadEmployees, []);

  const duplicateError = (() => {
    const { primaryEmpId, backup1EmpId, backup2EmpId } = form;
    if (!primaryEmpId) return '';
    if (backup1EmpId && primaryEmpId === backup1EmpId) return t('tasks.errorDuplicatePrimaryBackup1');
    if (backup2EmpId && primaryEmpId === backup2EmpId) return t('tasks.errorDuplicatePrimaryBackup2');
    if (backup1EmpId && backup2EmpId && backup1EmpId === backup2EmpId) return t('tasks.errorDuplicateBackup1Backup2');
    return '';
  })();

  const canSave =
    form.name.trim() !== '' &&
    form.primaryEmpId !== '' &&
    !duplicateError &&
    (form.frequency !== 'WEEKLY' || form.weeklyDays.length > 0) &&
    (form.frequency !== 'MONTHLY' || form.monthlyDay >= 1);

  const openAdd = () => {
    setForm({
      name: '',
      frequency: 'DAILY',
      weeklyDays: [],
      monthlyDay: 1,
      isLastDay: false,
      primaryEmpId: '',
      backup1EmpId: '',
      backup2EmpId: '',
    });
    setEditingTask(null);
    setModalOpen('add');
    setError('');
  };

  const openEdit = (task: Task) => {
    const plan = task.taskPlans[0];
    const sched = task.taskSchedules[0];
    setForm({
      name: task.name,
      frequency: (sched?.type ?? 'DAILY') as 'DAILY' | 'WEEKLY' | 'MONTHLY',
      weeklyDays: sched?.weeklyDays ?? [],
      monthlyDay: sched?.monthlyDay ?? 1,
      isLastDay: sched?.isLastDay ?? false,
      primaryEmpId: plan?.primary.empId ?? '',
      backup1EmpId: plan?.backup1.empId ?? '',
      backup2EmpId: plan?.backup2.empId ?? '',
    });
    setEditingTask(task);
    setModalOpen('add');
    setError('');
  };

  const closeModal = () => {
    setModalOpen(null);
    setEditingTask(null);
    setError('');
  };

  const deleteTask = async (task: Task) => {
    if (!window.confirm(t('tasks.deleteConfirm'))) return;
    setDeletingId(task.id);
    try {
      const res = await fetch(`/api/tasks/setup/${task.id}`, { method: 'DELETE' });
      if (res.ok) loadTasks();
      else setError(t('tasks.deleteError') || 'Failed to delete task');
    } catch {
      setError(t('tasks.deleteError') || 'Failed to delete task');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleWeeklyDay = (day: number) => {
    setForm((f) => ({
      ...f,
      weeklyDays: f.weeklyDays.includes(day) ? f.weeklyDays.filter((d) => d !== day) : [...f.weeklyDays, day].sort((a, b) => a - b),
    }));
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError('');
    setLoading(true);
    try {
      let taskId: string;
      if (editingTask) {
        const patchRes = await fetch(`/api/tasks/setup/${editingTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim() }),
        });
        if (!patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}));
          setError(data.error || data.details || 'Failed to update task');
          return;
        }
        taskId = editingTask.id;
      } else {
        const createRes = await fetch('/api/tasks/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim() }),
        });
        const created = await createRes.json().catch(() => ({}));
        if (!createRes.ok) {
          setError(created.error || created.details || 'Failed to create task');
          return;
        }
        taskId = created.id;
      }

      const planRes = await fetch(`/api/tasks/setup/${taskId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryEmpId: form.primaryEmpId,
          backup1EmpId: form.backup1EmpId || undefined,
          backup2EmpId: form.backup2EmpId || undefined,
        }),
      });
      if (!planRes.ok) {
        const data = await planRes.json().catch(() => ({}));
        const msg = data.code === 'DUPLICATE_PRIMARY_BACKUP1' ? t('tasks.errorDuplicatePrimaryBackup1')
          : data.code === 'DUPLICATE_PRIMARY_BACKUP2' ? t('tasks.errorDuplicatePrimaryBackup2')
          : data.code === 'DUPLICATE_BACKUP1_BACKUP2' ? t('tasks.errorDuplicateBackup1Backup2')
          : (data.error || data.details || 'Failed to save assignment');
        setError(msg);
        return;
      }

      const schedPayload = {
        type: form.frequency,
        weeklyDays: form.frequency === 'WEEKLY' ? form.weeklyDays : [],
        monthlyDay: form.frequency === 'MONTHLY' ? form.monthlyDay : null,
        isLastDay: form.frequency === 'MONTHLY' && form.isLastDay,
      };

      if (editingTask?.taskSchedules[0]) {
        const schedRes = await fetch(`/api/tasks/setup/${taskId}/schedule`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTask.taskSchedules[0].id, ...schedPayload }),
        });
        if (!schedRes.ok) {
          const data = await schedRes.json().catch(() => ({}));
          setError(data.error || data.details || 'Failed to update schedule');
          return;
        }
      } else {
        const schedRes = await fetch(`/api/tasks/setup/${taskId}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(schedPayload),
        });
        if (!schedRes.ok) {
          const data = await schedRes.json().catch(() => ({}));
          setError(data.error || data.details || 'Failed to save schedule');
          return;
        }
      }

      closeModal();
      loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/tasks" className="mb-4 inline-block text-base text-sky-600 hover:underline">
          ← {t('common.back')}
        </Link>
        <OpsCard title={t('tasks.setup')} className="mb-6">
          <button
            type="button"
            onClick={openAdd}
            className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700"
          >
            {t('tasks.addTask')}
          </button>
        </OpsCard>

        <ul className="space-y-4">
          {tasks.map((task) => (
            <li key={task.id}>
              <OpsCard title={task.name}>
                <p className="text-base text-slate-600">
                  {task.taskPlans[0]
                    ? `${t('tasks.primary')}: ${task.taskPlans[0].primary.name}, ${t('tasks.backup1')}: ${task.taskPlans[0].backup1.name}, ${t('tasks.backup2')}: ${task.taskPlans[0].backup2.name}`
                    : 'No plan set'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {task.taskSchedules.length > 0
                    ? task.taskSchedules
                        .map(
                          (s) =>
                            `${s.type}${s.weeklyDays?.length ? ` [${s.weeklyDays.join(',')}]` : ''}${s.monthlyDay != null ? ` day ${s.monthlyDay}` : ''}${s.isLastDay ? ' last' : ''}`
                        )
                        .join('; ')
                    : 'No schedule'}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(task)}
                    className="text-base text-sky-600 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTask(task)}
                    disabled={!!deletingId}
                    className="text-base text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === task.id ? t('common.loading') : t('common.delete')}
                  </button>
                </div>
              </OpsCard>
            </li>
          ))}
        </ul>
      </div>

      {modalOpen === 'add' && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={closeModal} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              {editingTask ? t('tasks.editTask') : t('tasks.addTask')}
            </h3>
            <form onSubmit={saveTask} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('common.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
                  placeholder={t('common.name')}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('tasks.frequency')}</label>
                <div className="flex gap-4">
                  {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((freq) => (
                    <label key={freq} className="flex items-center gap-2 text-base">
                      <input
                        type="radio"
                        name="frequency"
                        checked={form.frequency === freq}
                        onChange={() => setForm((f) => ({ ...f, frequency: freq }))}
                      />
                      {t(`tasks.${freq.toLowerCase()}`)}
                    </label>
                  ))}
                </div>
              </div>

              {form.frequency === 'WEEKLY' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{t('schedule.day')}</label>
                  <div className="flex flex-wrap gap-3">
                    {WEEKLY_DAY_KEYS.map((key, i) => (
                      <label key={key} className="flex items-center gap-1 text-base">
                        <input
                          type="checkbox"
                          checked={form.weeklyDays.includes(i)}
                          onChange={() => toggleWeeklyDay(i)}
                        />
                        {t(`days.${key}`)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.frequency === 'MONTHLY' && (
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedule.day')} (1–31)</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={form.monthlyDay}
                      onChange={(e) => setForm((f) => ({ ...f, monthlyDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) }))}
                      className="w-24 rounded border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      checked={form.isLastDay}
                      onChange={(e) => setForm((f) => ({ ...f, isLastDay: e.target.checked }))}
                    />
                    {t('tasks.lastDayOfMonth')}
                  </label>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <p className="mb-3 text-sm font-medium text-slate-700">Assignment</p>
                <div className="space-y-3">
                  <EmployeeSelect
                    label={t('tasks.primary')}
                    value={form.primaryEmpId}
                    onChange={(v) => setForm((f) => ({ ...f, primaryEmpId: v }))}
                    allowEmpty={false}
                    employees={employees}
                  />
                  <EmployeeSelect
                    label={t('tasks.backup1')}
                    value={form.backup1EmpId}
                    onChange={(v) => setForm((f) => ({ ...f, backup1EmpId: v }))}
                    allowEmpty
                    employees={employees}
                  />
                  <EmployeeSelect
                    label={t('tasks.backup2')}
                    value={form.backup2EmpId}
                    onChange={(v) => setForm((f) => ({ ...f, backup2EmpId: v }))}
                    allowEmpty
                    employees={employees}
                  />
                </div>
                {duplicateError && <p className="mt-2 text-sm text-red-600">{duplicateError}</p>}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!canSave || loading}
                  className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="rounded border border-slate-300 px-4 py-2 text-base hover:bg-slate-50">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
