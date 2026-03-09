'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';

type UserRow = { id: string; empId: string; employee?: { name: string } | null };

export function ResetPasswordClient() {
  const { t } = useT();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [empId, setEmpId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const handleSubmit = useCallback(async () => {
    const selected = empId.trim();
    if (!selected) {
      setMessage({ type: 'error', text: t('admin.resetPassword.selectUser') || 'اختر الموظف' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: t('admin.resetPassword.minLength') || 'كلمة المرور 8 أحرف على الأقل' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('admin.resetPassword.mismatch') || 'كلمة المرور وتأكيدها غير متطابقتين' });
      return;
    }
    if (!window.confirm(t('admin.resetPassword.confirm') || 'تأكيد: إعادة تعيين كلمة المرور لهذا الموظف؟ سيُطلب منه تغييرها عند الدخول.')) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId: selected, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed' });
        return;
      }
      setMessage({ type: 'success', text: t('admin.resetPassword.success') || 'تم إعادة تعيين كلمة المرور بنجاح' });
      setEmpId('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setSubmitting(false);
    }
  }, [empId, newPassword, confirmPassword, t]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">
        {t('nav.admin.resetPassword')}
      </h1>

      <OpsCard title={t('admin.resetPassword.formTitle') || 'إعادة تعيين كلمة المرور'} className="rounded-2xl border border-border shadow-sm">
        <p className="mb-4 text-sm text-muted">
          {t('admin.resetPassword.hint') || 'اختر الموظف ثم أدخل كلمة المرور الجديدة. سيُطلب منه تغييرها عند أول دخول.'}
        </p>

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetPassword.selectUser') || 'الموظف'}
                </span>
                <select
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                >
                  <option value="">— {t('common.search')} / اختر —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.empId}>
                      {u.empId} — {u.employee?.name ?? '—'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetPassword.newPassword') || 'كلمة المرور الجديدة'}
                </span>
                <div className="flex gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('admin.resetPassword.passwordPlaceholder') || '8 أحرف على الأقل'}
                    className="flex-1 rounded border border-border px-3 py-2 text-sm"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="rounded border border-border px-2 text-xs text-muted"
                    title={showPassword ? (t('auth.hidePassword') || 'Hide') : (t('auth.showPassword') || 'Show')}
                  >
                    {showPassword ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t('admin.resetPassword.confirmPassword') || 'تأكيد كلمة المرور'}
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('admin.resetPassword.confirmPlaceholder') || 'أعد إدخال كلمة المرور'}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
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
                disabled={submitting || !empId || !newPassword || !confirmPassword}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? t('common.loading') : (t('admin.resetPassword.submit') || 'إعادة تعيين كلمة المرور')}
              </button>
            </div>
          </>
        )}
      </OpsCard>
    </div>
  );
}
