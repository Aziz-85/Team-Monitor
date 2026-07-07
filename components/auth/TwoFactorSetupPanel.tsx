'use client';

import { useCallback, useState } from 'react';
import QRCode from 'react-qr-code';
import { useT } from '@/lib/i18n/useT';
import { formatBase32Secret, normalizeBase32Secret } from '@/lib/formatBase32Secret';

type Props = {
  otpauthUri: string;
  manualSecret: string;
  totpCode: string;
  onTotpCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string;
  onBack?: () => void;
};

export function TwoFactorSetupPanel({
  otpauthUri,
  manualSecret,
  totpCode,
  onTotpCodeChange,
  onSubmit,
  loading,
  error,
  onBack,
}: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const groupedSecret = formatBase32Secret(manualSecret);

  const copySecret = useCallback(async () => {
    const raw = normalizeBase32Secret(manualSecret);
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [manualSecret]);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {t('auth.twoFactorSetupTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('auth.twoFactorSetupIntro')}</p>
      </div>

      <ol className="space-y-4 text-sm text-slate-700">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
            1
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{t('auth.twoFactorSetupStep1')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('auth.twoFactorSetupStep1Hint')}</p>
            {otpauthUri ? (
              <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white p-4">
                <QRCode
                  value={otpauthUri}
                  size={168}
                  level="M"
                  className="h-auto w-full max-w-[168px]"
                  aria-label={t('auth.twoFactorQrAlt')}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-700">{t('auth.twoFactorQrLoading')}</p>
            )}
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
            2
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{t('auth.twoFactorSetupStep2')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('auth.twoFactorSetupStep2Hint')}</p>
            {groupedSecret ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p
                  className="select-all break-all text-center font-mono text-sm tracking-wider text-slate-800"
                  dir="ltr"
                >
                  {groupedSecret}
                </p>
                <button
                  type="button"
                  onClick={() => void copySecret()}
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? t('auth.secretCopied') : t('auth.copySecret')}
                </button>
              </div>
            ) : null}
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
            3
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{t('auth.twoFactorSetupStep3')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('auth.twoFactorSetupStep3Hint')}</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => onTotpCodeChange(e.target.value.replace(/\D/g, ''))}
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-center text-lg tracking-[0.35em]"
              placeholder="000000"
              required
              autoComplete="one-time-code"
              autoFocus
              aria-label={t('auth.twoFactorCodeLabel')}
            />
          </div>
        </li>
      </ol>

      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={loading || totpCode.length !== 6}
          className="w-full rounded bg-sky-600 px-4 py-2.5 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('auth.twoFactorEnable')}
        </button>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t('common.back')}
          </button>
        ) : null}
      </div>
    </form>
  );
}
