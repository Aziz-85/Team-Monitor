'use client';

import { useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useI18n } from '@/app/providers';
import { formatDateDisplayRiyadh } from '@/lib/time';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type LeaveRow = {
  id: string;
  empId: string;
  type: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  employee: { empId: string; name: string };
};

type EmployeeOption = { empId: string; name: string };

type LeaveTypeValue = 'ANNUAL' | 'EXHIBITION' | 'SICK' | 'OTHER_BRANCH' | 'EMERGENCY' | 'OTHER';
const LEAVE_TYPES: LeaveTypeValue[] = ['ANNUAL', 'EXHIBITION', 'SICK', 'OTHER_BRANCH', 'EMERGENCY', 'OTHER'];

/** Normalize date string from API (ISO or YYYY-MM-DD) to YYYY-MM-DD */
function toDateOnly(s: string): string {
  if (!s) return s;
  const part = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : s;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(toDateOnly(start) + 'T12:00:00Z').getTime();
  const b = new Date(toDateOnly(end) + 'T12:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

export function LeavesPageClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const [list, setList] = useState<LeaveRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmpId, setFilterEmpId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editLeave, setEditLeave] = useState<LeaveRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overlapWarning, setOverlapWarning] = useState('');
  const [addForm, setAddForm] = useState({
    empId: '',
    type: 'ANNUAL' as LeaveTypeValue,
    startDate: '',
    endDate: '',
    notes: '',
  });

  const leaveTypeLabel = (type: string) => {
    const key: Record<string, string> = {
      ANNUAL: 'leaves.typeAnnual',
      EXHIBITION: 'leaves.typeExhibition',
      SICK: 'leaves.typeSick',
      OTHER_BRANCH: 'leaves.typeOtherBranch',
      EMERGENCY: 'leaves.typeEmergency',
      OTHER: 'leaves.typeOther',
    };
    return t(key[type] ?? 'leaves.typeOther');
  };

  const loadLeaves = () => {
    const params = new URLSearchParams();
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    if (filterEmpId) params.set('empId', filterEmpId);
    if (filterType) params.set('type', filterType);
    fetch(`/api/leaves?${params}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => []))
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  };

  const loadEmployees = () => {
    fetch('/api/leaves/employees')
      .then((r) => r.json().catch(() => []))
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]));
  };

  useEffect(loadEmployees, []);
  useEffect(loadLeaves, [filterEmpId, filterFrom, filterTo, filterType]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOverlapWarning('');
    const start = addForm.startDate;
    const end = addForm.endDate;
    if (start > end) {
      setError('startDate must be <= endDate');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId: addForm.empId,
          type: addForm.type,
          startDate: start,
          endDate: end,
          notes: addForm.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Failed');
        return;
      }
      setAddOpen(false);
      setAddForm({ empId: '', type: 'ANNUAL' as LeaveTypeValue, startDate: '', endDate: '', notes: '' });
      loadLeaves();
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLeave) return;
    setError('');
    const start = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="startDate"]')?.value ?? editLeave.startDate.slice(0, 10);
    const end = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="endDate"]')?.value ?? editLeave.endDate.slice(0, 10);
    if (start > end) {
      setError('startDate must be <= endDate');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/leaves/${editLeave.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId: editLeave.empId,
          type: editLeave.type,
          startDate: start,
          endDate: end,
          notes: (e.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="notes"]')?.value ?? editLeave.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Failed');
        return;
      }
      setEditLeave(null);
      loadLeaves();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    setLoading(true);
    try {
      await fetch(`/api/leaves/${id}`, { method: 'DELETE' });
      loadLeaves();
    } finally {
      setLoading(false);
    }
  };

  const checkOverlap = (empId: string, startDate: string, endDate: string, excludeId?: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const overlaps = list.filter(
      (l) =>
        l.employee.empId === empId &&
        l.id !== excludeId &&
        new Date(l.startDate) <= end &&
        new Date(l.endDate) >= start
    );
    return overlaps.length > 0;
  };

  return (
    <div className="p-4 md:p-6">
      <OpsCard title={t('leaves.title')} className="mb-4">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <select
            value={filterEmpId}
            onChange={(e) => setFilterEmpId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          >
            <option value="">{t('leaves.employee')} (all)</option>
            {employees.map((e) => (
              <option key={e.empId} value={e.empId}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            placeholder={t('common.from')}
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
          <input
            type="date"
            placeholder={t('common.to')}
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          >
            <option value="">{t('leaves.type')} (all)</option>
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>{leaveTypeLabel(type)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700"
          >
            {t('leaves.addLeave')}
          </button>
        </div>
      </OpsCard>

      <OpsCard>
        <LuxuryTable>
          <LuxuryTableHead>
            <LuxuryTh>{t('leaves.employee')}</LuxuryTh>
            <LuxuryTh>{t('leaves.type')}</LuxuryTh>
            <LuxuryTh>{t('leaves.startDate')}</LuxuryTh>
            <LuxuryTh>{t('leaves.endDate')}</LuxuryTh>
            <LuxuryTh>{t('leaves.duration')}</LuxuryTh>
            <LuxuryTh>—</LuxuryTh>
          </LuxuryTableHead>
          <LuxuryTableBody>
            {list.map((row) => (
              <tr key={row.id}>
                <LuxuryTd>{row.employee.name}</LuxuryTd>
                <LuxuryTd>{leaveTypeLabel(row.type)}</LuxuryTd>
                <LuxuryTd>{formatDateDisplayRiyadh(row.startDate)}</LuxuryTd>
                <LuxuryTd>{formatDateDisplayRiyadh(row.endDate)}</LuxuryTd>
                <LuxuryTd>{daysBetween(row.startDate, row.endDate)} {t('leaves.days')}</LuxuryTd>
                <LuxuryTd>
                  <button
                    type="button"
                    onClick={() => setEditLeave(row)}
                    className="mr-2 text-sky-600 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row.id)}
                    className="text-red-600 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                </LuxuryTd>
              </tr>
            ))}
          </LuxuryTableBody>
        </LuxuryTable>
      </OpsCard>

      {addOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setAddOpen(false)} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">{t('leaves.addLeave')}</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium">{t('leaves.employee')}</label>
                <select
                  value={addForm.empId}
                  onChange={(e) => {
                    setAddForm((f) => ({ ...f, empId: e.target.value }));
                    if (e.target.value && addForm.startDate && addForm.endDate) {
                      const overlap = checkOverlap(e.target.value, addForm.startDate, addForm.endDate);
                      setOverlapWarning(overlap ? t('leaves.overlapWarning') : '');
                    } else setOverlapWarning('');
                  }}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                  required
                >
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.empId} value={e.empId}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.type')}</label>
                <select
                  value={addForm.type}
                  onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as LeaveTypeValue }))}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                >
                  {LEAVE_TYPES.map((type) => (
                    <option key={type} value={type}>{leaveTypeLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.startDate')}</label>
                <input
                  type="date"
                  value={addForm.startDate}
                  onChange={(e) => {
                    setAddForm((f) => ({ ...f, startDate: e.target.value }));
                    if (addForm.empId && addForm.endDate) {
                      const overlap = checkOverlap(addForm.empId, e.target.value, addForm.endDate);
                      setOverlapWarning(overlap ? t('leaves.overlapWarning') : '');
                    }
                  }}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.endDate')}</label>
                <input
                  type="date"
                  value={addForm.endDate}
                  onChange={(e) => {
                    setAddForm((f) => ({ ...f, endDate: e.target.value }));
                    if (addForm.empId && addForm.startDate) {
                      const overlap = checkOverlap(addForm.empId, addForm.startDate, e.target.value);
                      setOverlapWarning(overlap ? t('leaves.overlapWarning') : '');
                    }
                  }}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.notes')}</label>
                <input
                  type="text"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              {overlapWarning && <p className="text-sm text-amber-700">{overlapWarning}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className="rounded bg-sky-600 px-4 py-2 text-white hover:bg-sky-700">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setAddOpen(false)} className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {editLeave && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditLeave(null)} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">{t('leaves.editLeave')}</h3>
            <form
              onSubmit={handleEdit}
              className="space-y-3"
            >
              <div>
                <label className="block text-sm font-medium">{t('leaves.employee')}</label>
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-base">{editLeave.employee.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.type')}</label>
                <select
                  value={editLeave.type}
                  onChange={(e) => setEditLeave((l) => l ? { ...l, type: e.target.value } : null)}
                  name="type"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                >
                  {LEAVE_TYPES.map((type) => (
                    <option key={type} value={type}>{leaveTypeLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.startDate')}</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={editLeave.startDate.slice(0, 10)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.endDate')}</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={editLeave.endDate.slice(0, 10)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t('leaves.notes')}</label>
                <input
                  type="text"
                  name="notes"
                  defaultValue={editLeave.notes ?? ''}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className="rounded bg-sky-600 px-4 py-2 text-white hover:bg-sky-700">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setEditLeave(null)} className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50">
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
