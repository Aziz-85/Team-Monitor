'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { authFetch, fetchCsrfToken } from '@/lib/client/authFetch';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useT();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchCsrfToken();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (!res.ok) {
        setError(t('auth.passwordChangeFailed'));
        return;
      }
      router.push('/login?reason=password_changed');
      router.refresh();
    } catch {
      setError(t('auth.connectionError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pb-nav">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">{t('nav.changePassword')}</h1>
        <p className="mb-6 text-xs text-slate-500">{t('auth.passwordPolicyHint')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.currentPassword')}
            </label>
            <div className="relative">
              <input
                id="current"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 pe-10 text-base"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={showCurrentPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showCurrentPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="new" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.newPassword')}
            </label>
            <div className="relative">
              <input
                id="new"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 pe-10 text-base"
                required
                minLength={12}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={showNewPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
