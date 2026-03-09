'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';

type UserRow = { id: string; empId: string; employee?: { name: string } | null };

export function ResetEmpIdClient() {
  const { t } = useT();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [oldEmpId, setOldEmpId] = useState('');
  const [newEmpId, setNewEmpId] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSelectEmployee = useCallback((empId: string) => {
    setOldEmpId(empId);
    const u = users.find((x) => x.empId === empId);
    if (u?.employee?.name) setFullName(u.employee.name);
    else setFullName('');
  }, [users]);

  const handleSubmit = useCallback(async () => {
    const old = oldEmpId.trim();
    const newId = newEmpId.trim();
    if (!old || !newId) {
      setMessage({ type: 'error', text: t('admin.resetEmpId.oldAndNewRequired') || 'الرقم الحالي والرقم الجديد مطلوبان' });
      return;
    }
    if (old === newId) {
      setMessage({ type: 'error', text: t('admin.resetEmpId.mustDiffer') || 'الرقم الجديد يجب أن يختلف عن الحالي' });
      return;
    }
    if (!/^\d{3,}$/.test(newId)) {
      setMessage({ type: 'error', text: t('admin.resetEmpId.newMustBeDigits') || 'الرقم الجديد: أرقام فقط، 3 خانات على الأقل' });
      return;
    }
    if (!window.confirm(t('admin.resetEmpId.confirm') || `تأكيد: تغيير الرقم من ${old} إلى ${newId}؟`)) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users/fix-empid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldEmpId: old,
          newEmpId: newId,
          ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed' });
        return;
      }
      setMessage({ type: 'success', text: t('admin.resetEmpId.success') || `تم تغيير الرقم من ${old} إلى ${newId}` });
      setOldEmpId('');
      setNewEmpId('');
      setFullName('');
      fetchUsers();
    } finally {
      setSubmitting(false);
    }
  }, [oldEmpId, newEmpId, fullName, t, fetchUsers]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">
        {t('nav.admin.resetEmpId')}
      </h1>

      <OpsCard title={t('admin.resetEmpId.formTitle') || 'إعادة تعيين الرقم السني (رقم الموظف)'} className="rounded-2xl border border-border shadow-sm">
        <p className="mb-4 text-sm text-muted">
          {t('admin.resetEmpId.hint') || 'اختر الموظف ثم أدخل الرقم السني الجديد. الرقم الحالي سيُستبدل في النظام (User + Employee).'}
        </p>

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetEmpId.currentNumber') || 'الرقم الحالي'}
                </span>
                <select
                  value={oldEmpId}
                  onChange={(e) => handleSelectEmployee(e.target.value)}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                >
                  <option value="">— {t('common.search')} / اختر —</option>
                  {users
                    .filter((u) => !['admin', 'super_admin', 'UNASSIGNED'].includes(u.empId))
                    .map((u) => (
                      <option key={u.id} value={u.empId}>
                        {u.empId} — {u.employee?.name ?? '—'}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetEmpId.employeeName') || 'الاسم (للتحقق، اختياري)'}
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('admin.resetEmpId.namePlaceholder') || 'مطابق للرقم المختار'}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetEmpId.newNumber') || 'الرقم السني الجديد'}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newEmpId}
                  onChange={(e) => setNewEmpId(e.target.value.replace(/\D/g, ''))}
                  placeholder="مثال: 2011"
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                  maxLength={20}
                />
                <p className="mt-1 text-xs text-muted">
                  {t('admin.resetEmpId.newNumberHint') || 'أرقام فقط، 3 خانات على الأقل'}
                </p>
              </label>
            </div>

            {message && (
              <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {message.text}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !oldEmpId || !newEmpId}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? t('common.loading') : (t('admin.resetEmpId.submit') || 'تنفيذ إعادة التعيين')}
              </button>
            </div>
          </>
        )}
      </OpsCard>
    </div>
  );
}
