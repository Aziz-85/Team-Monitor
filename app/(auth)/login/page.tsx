'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getPostLoginPath, type Role } from '@/lib/permissions';
import { authFetch, fetchCsrfToken } from '@/lib/client/authFetch';

type Step = 'credentials' | 'totp' | 'setup';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const [pendingToken, setPendingToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [manualSecret, setManualSecret] = useState('');

  useEffect(() => {
    void fetchCsrfToken();
    const err = new URLSearchParams(window.location.search).get('error');
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (err === 'no_boutique') setError(t('auth.noBoutique'));
    else if (reason === 'idle') setError(t('auth.idleSignOut'));
    else if (reason === 'password_changed') setError(t('auth.passwordChangedPleaseLogin'));
  }, [t]);

  const finishLogin = useCallback(
    (data: { role: string; mustChangePassword?: boolean }) => {
      if (data.mustChangePassword) {
        router.push('/change-password');
        return;
      }
      router.push(getPostLoginPath(data.role as Role));
    },
    [router]
  );

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetchCsrfToken();
      const res = await authFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) setError(t('auth.tooManyAttempts'));
        else if (res.status >= 500) setError(t('auth.serverError'));
        else setError(t('auth.loginFailed'));
        return;
      }
      if (data.requires2faSetup && data.setupToken) {
        setSetupToken(data.setupToken);
        setStep('setup');
        const setupRes = await authFetch('/api/auth/2fa/setup', {
          method: 'POST',
          body: JSON.stringify({ setupToken: data.setupToken }),
        });
        const setupData = await setupRes.json().catch(() => ({}));
        if (setupRes.ok) {
          setOtpauthUri(setupData.otpauthUri ?? '');
          setManualSecret(setupData.manualSecret ?? '');
        }
        return;
      }
      if (data.requires2fa && data.pendingToken) {
        setPendingToken(data.pendingToken);
        setStep('totp');
        return;
      }
      if (data.ok) finishLogin(data);
    } catch {
      setError(t('auth.connectionError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ pendingToken, code: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t('auth.loginFailed'));
        return;
      }
      finishLogin(data);
    } catch {
      setError(t('auth.connectionError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ setupToken, code: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t('auth.loginFailed'));
        return;
      }
      finishLogin(data);
    } catch {
      setError(t('auth.connectionError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">{t('nav.appTitle')}</h1>

        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                {t('auth.username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                required
                autoComplete="username"
              />
              <p className="mt-1 text-xs text-slate-500">{t('auth.usernameHint')}</p>
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 pe-10 text-base"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {t('common.login')}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={handleTotp} className="space-y-4">
            <p className="text-sm text-slate-600">{t('auth.twoFactorPrompt')}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-center text-lg tracking-widest"
              placeholder="000000"
              required
              autoComplete="one-time-code"
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-sky-600 px-4 py-2 text-base font-medium text-white disabled:opacity-50"
            >
              {t('auth.twoFactorVerify')}
            </button>
          </form>
        )}

        {step === 'setup' && (
          <form onSubmit={handleSetupConfirm} className="space-y-4">
            <p className="text-sm text-slate-600">{t('auth.twoFactorSetupPrompt')}</p>
            {manualSecret ? (
              <p className="break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">{manualSecret}</p>
            ) : null}
            {otpauthUri ? (
              <p className="break-all text-xs text-slate-500">{otpauthUri}</p>
            ) : null}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-center text-lg tracking-widest"
              placeholder="000000"
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-sky-600 px-4 py-2 text-base font-medium text-white disabled:opacity-50"
            >
              {t('auth.twoFactorEnable')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
