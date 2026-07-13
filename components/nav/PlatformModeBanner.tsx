'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { readCsrfTokenFromDocument } from '@/components/env/StagingBanner';

type PlatformModeState = {
  isPlatformOwner: boolean;
  activeMode: 'BRANCH_MANAGER' | 'PLATFORM_ADMIN';
  boutiqueLabel?: string;
  requiresStepUp: 'totp' | 'password';
};

function readCsrfToken(): string {
  return readCsrfTokenFromDocument();
}

export function PlatformModeBanner() {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState<PlatformModeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState('');
  const [showStepUp, setShowStepUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/platform-mode', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!data?.isPlatformOwner) {
      setState(null);
      return;
    }
    setState({
      isPlatformOwner: true,
      activeMode: data.activeMode === 'PLATFORM_ADMIN' ? 'PLATFORM_ADMIN' : 'BRANCH_MANAGER',
      boutiqueLabel: data.boutiqueLabel,
      requiresStepUp: data.requiresStepUp === 'totp' ? 'totp' : 'password',
    });
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  if (!state?.isPlatformOwner) return null;

  const isPlatformAdmin = state.activeMode === 'PLATFORM_ADMIN';

  const switchMode = async (action: 'enable' | 'disable') => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { action };
      if (action === 'enable') {
        if (state.requiresStepUp === 'totp') body.totpCode = stepUp;
        else body.password = stepUp;
      }
      const res = await fetch('/api/auth/platform-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': readCsrfToken(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as string) || (t('nav.platformMode.error') as string));
        return;
      }
      setStepUp('');
      setShowStepUp(false);
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`shrink-0 border-b px-3 py-2 text-sm ${
        isPlatformAdmin
          ? 'border-indigo-200 bg-indigo-50 text-indigo-950'
          : 'border-border bg-surface-subtle text-foreground'
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">
            {isPlatformAdmin ? t('nav.platformMode.platformAdmin') : t('nav.platformMode.branchManager')}
          </span>
          <span className="ms-2 text-muted">
            {isPlatformAdmin ? t('nav.platformMode.globalAccess') : state.boutiqueLabel || t('nav.platformMode.branchScope')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showStepUp && !isPlatformAdmin ? (
            <input
              type={state.requiresStepUp === 'password' ? 'password' : 'text'}
              value={stepUp}
              onChange={(e) => setStepUp(e.target.value)}
              placeholder={
                state.requiresStepUp === 'totp'
                  ? (t('nav.platformMode.totpPlaceholder') as string)
                  : (t('nav.platformMode.passwordPlaceholder') as string)
              }
              className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
            />
          ) : null}
          {error ? <span className="text-xs text-rose-700">{error}</span> : null}
          {isPlatformAdmin ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode('disable')}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
            >
              {t('nav.platformMode.returnBranchManager')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!showStepUp) {
                  setShowStepUp(true);
                  return;
                }
                switchMode('enable');
              }}
              className="rounded-md border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {showStepUp ? t('nav.platformMode.confirmSwitch') : t('nav.platformMode.switchPlatformAdmin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
