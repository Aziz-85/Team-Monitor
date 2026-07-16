'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { PageHeader } from '@/components/ui/PageHeader';
import { PanelCard } from '@/components/ui/PanelCard';
import { Button } from '@/components/ui/Button';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch, fetchCsrfToken } from '@/lib/client/authFetch';

type TrustedDevice = {
  id: string;
  deviceName: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  lastIp: string | null;
  isCurrent: boolean;
};

type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SecuritySettingsClient() {
  const { t } = useT();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [trustedEnabled, setTrustedEnabled] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devRes, sessRes] = await Promise.all([
        fetch('/api/auth/trusted-devices', { cache: 'no-store' }),
        fetch('/api/auth/sessions', { cache: 'no-store' }),
      ]);
      const devJson = await devRes.json().catch(() => ({}));
      const sessJson = await sessRes.json().catch(() => ({}));
      if (!devRes.ok) throw new Error(devJson.error ?? t('securitySettings.loadError'));
      if (!sessRes.ok) throw new Error(sessJson.error ?? t('securitySettings.loadError'));
      setTrustedEnabled(Boolean(devJson.enabled));
      setDevices(Array.isArray(devJson.devices) ? devJson.devices : []);
      setSessions(Array.isArray(sessJson.sessions) ? sessJson.sessions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('securitySettings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeDevice(deviceId: string) {
    setMessage(null);
    await fetchCsrfToken();
    const res = await authFetch('/api/auth/trusted-devices/revoke', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) {
      setError(t('securitySettings.revokeFailed'));
      return;
    }
    setMessage(t('securitySettings.revokedOne'));
    await load();
  }

  async function revokeAllDevices() {
    if (!window.confirm(t('securitySettings.revokeAllConfirm'))) return;
    setMessage(null);
    await fetchCsrfToken();
    const res = await authFetch('/api/auth/trusted-devices/revoke-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setError(t('securitySettings.revokeFailed'));
      return;
    }
    setMessage(t('securitySettings.revokedAll'));
    await load();
  }

  async function saveRename(deviceId: string) {
    await fetchCsrfToken();
    const res = await authFetch(`/api/auth/trusted-devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ deviceName: renameValue }),
    });
    if (!res.ok) {
      setError(t('securitySettings.renameFailed'));
      return;
    }
    setRenameId(null);
    setRenameValue('');
    setMessage(t('securitySettings.renamed'));
    await load();
  }

  async function revokeOtherSessions() {
    if (!window.confirm(t('securitySettings.revokeSessionsConfirm'))) return;
    await fetchCsrfToken();
    const res = await authFetch('/api/auth/sessions', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke-others' }),
    });
    if (!res.ok) {
      setError(t('securitySettings.revokeFailed'));
      return;
    }
    setMessage(t('securitySettings.sessionsRevoked'));
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('securitySettings.title')} subtitle={t('securitySettings.subtitle')} />

      {error ? <FeedbackBanner variant="error" message={error} onDismiss={() => setError(null)} /> : null}
      {message ? (
        <FeedbackBanner variant="success" message={message} onDismiss={() => setMessage(null)} />
      ) : null}

      <PanelCard title={t('securitySettings.twoFactorTitle')}>
        <p className="text-sm text-muted">{t('securitySettings.twoFactorBody')}</p>
      </PanelCard>

      <PanelCard title={t('securitySettings.passkeysTitle')}>
        <p className="text-sm text-muted">{t('securitySettings.passkeysComingSoon')}</p>
      </PanelCard>

      <PanelCard
        title={t('securitySettings.trustedDevicesTitle')}
        actions={
          trustedEnabled && devices.length > 0 ? (
            <Button type="button" variant="secondary" onClick={() => void revokeAllDevices()}>
              {t('securitySettings.revokeAll')}
            </Button>
          ) : null
        }
      >
        {!trustedEnabled ? (
          <p className="text-sm text-muted">{t('securitySettings.trustedDisabled')}</p>
        ) : loading ? (
          <EmptyState title={t('common.loading')} />
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted">{t('securitySettings.noTrustedDevices')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  {renameId === d.id ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="rounded border border-border bg-surface px-2 py-1 text-sm"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={80}
                      />
                      <Button type="button" onClick={() => void saveRename(d.id)}>
                        {t('common.save')}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setRenameId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <p className="font-medium text-foreground">
                      {d.deviceName || t('securitySettings.unnamedDevice')}
                      {d.isCurrent ? (
                        <span className="ms-2 text-xs font-normal text-accent">
                          {t('securitySettings.thisDevice')}
                        </span>
                      ) : null}
                    </p>
                  )}
                  <p className="text-muted">
                    {[d.browser, d.operatingSystem].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="text-xs text-muted">
                    {t('securitySettings.firstTrusted')}: {fmt(d.createdAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {t('securitySettings.lastUsed')}: {fmt(d.lastUsedAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {t('securitySettings.lastIp')}: {d.lastIp ?? '—'}
                  </p>
                  <p className="text-xs text-muted">
                    {t('securitySettings.expires')}: {fmt(d.expiresAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRenameId(d.id);
                      setRenameValue(d.deviceName ?? '');
                    }}
                  >
                    {t('securitySettings.rename')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void revokeDevice(d.id)}>
                    {t('securitySettings.revoke')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title={t('securitySettings.sessionsTitle')}
        actions={
          <Button type="button" variant="secondary" onClick={() => void revokeOtherSessions()}>
            {t('securitySettings.revokeOtherSessions')}
          </Button>
        }
      >
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">{t('securitySettings.noSessions')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <p className="font-medium text-foreground">
                  {s.isCurrent ? t('securitySettings.currentSession') : t('securitySettings.otherSession')}
                </p>
                <p className="text-xs text-muted">
                  {t('securitySettings.lastUsed')}: {fmt(s.lastSeenAt)}
                </p>
                <p className="text-xs text-muted">
                  {t('securitySettings.expires')}: {fmt(s.expiresAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard title={t('securitySettings.recoveryTitle')}>
        <p className="text-sm text-muted">{t('securitySettings.recoveryBody')}</p>
      </PanelCard>
    </div>
  );
}
