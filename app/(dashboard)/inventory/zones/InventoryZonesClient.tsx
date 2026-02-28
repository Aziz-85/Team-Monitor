'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type AssignmentRow = {
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  empId: string | null;
  employeeName: string | null;
};

type EmployeeOption = { empId: string; name: string };

export function InventoryZonesClient({ embedded }: { embedded?: boolean } = {}) {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [assignSelect, setAssignSelect] = useState<Record<string, string>>({});
  const [filterByEmpId, setFilterByEmpId] = useState<string>('');

  const loadAssignments = () => {
    fetch('/api/inventory/zones/assignments')
      .then((r) => r.json())
      .then(setAssignments)
      .catch(() => setAssignments([]));
  };

  useEffect(() => {
    loadAssignments();
    fetch('/api/leaves/employees')
      .then((r) => r.json())
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};
    assignments.forEach((a) => {
      if (a.empId) next[a.zoneId] = a.empId;
    });
    setAssignSelect(next);
  }, [assignments]);

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    const res = await fetch('/api/inventory/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode.trim(), name: newName.trim() || undefined }),
    });
    if (res.ok) {
      setNewCode('');
      setNewName('');
      loadAssignments();
    }
  };

  const handleAssign = async (zoneId: string, empId: string | null) => {
    const res = await fetch('/api/inventory/zones/assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: [{ zoneId, empId: empId || null }] }),
    });
    if (res.ok) {
      const data = await res.json();
      setAssignments(data);
    }
  };

  const filteredAssignments = filterByEmpId
    ? assignments.filter((a) => a.empId === filterByEmpId)
    : assignments;

  return (
    <div className={embedded ? '' : 'p-4 md:p-6'}>
      <div className="mx-auto max-w-3xl">
        {!embedded && (
          <Link href="/inventory/daily" className="mb-4 inline-block text-base text-sky-600 hover:underline">
            ← {t('common.back')}
          </Link>
        )}
        <OpsCard title={t('inventory.zones')}>
          <form onSubmit={handleAddZone} className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('inventory.zoneCode')}</label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="A"
                className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('inventory.zoneName')}</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:h-10"
            >
              {t('inventory.addZone')}
            </button>
          </form>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('inventory.assignments')}</h3>
            <select
              value={filterByEmpId}
              onChange={(e) => setFilterByEmpId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
              aria-label={t('inventory.showZonesForEmployee')}
            >
              <option value="">{t('inventory.allZones')}</option>
              {employees.map((emp) => (
                <option key={emp.empId} value={emp.empId}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <ul className="space-y-2">
            {filteredAssignments.map((a) => (
              <li key={a.zoneId} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-lg font-semibold text-slate-900">{a.zoneCode}</span>
                {a.zoneName && <span className="text-sm text-slate-600">({a.zoneName})</span>}
                <span className="text-slate-500">→</span>
                <select
                  value={assignSelect[a.zoneId] ?? ''}
                  onChange={(e) => handleAssign(a.zoneId, e.target.value || null)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 md:h-10"
                >
                  <option value="">—</option>
                  {employees.map((emp) => (
                    <option key={emp.empId} value={emp.empId}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </OpsCard>
        {!embedded && (
          <div className="mt-4">
            <Link href="/inventory/zones" className="text-base text-sky-600 hover:underline">
              {t('inventory.weekly')} →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
