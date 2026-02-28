'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

function formatRiyadh(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Riyadh',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

type VersionInfo = { appVersion: string; gitHash: string; buildDate: string; environment: string };
type DeployRow = {
  id: string;
  createdAt: string;
  appVersion: string;
  gitHash: string;
  buildDate: string;
  environment: string;
  serverHost: string | null;
  deploySource: string;
  notes: string | null;
  deployedByName: string | null;
};
type ReleaseRow = {
  id: string;
  version: string;
  title: string;
  notes: string;
  createdAt: string;
  isPublished: boolean;
  createdByName: string | null;
};

const PAGE_SIZE = 20;

export function AdminVersionClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);

  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [deploys, setDeploys] = useState<{ items: DeployRow[]; total: number; page: number }>({
    items: [],
    total: 0,
    page: 1,
  });
  const [deployEnvFilter, setDeployEnvFilter] = useState<string>('');
  const [releases, setReleases] = useState<{ items: ReleaseRow[]; total: number; page: number }>({
    items: [],
    total: 0,
    page: 1,
  });
  const [registerModal, setRegisterModal] = useState(false);
  const [registerNotes, setRegisterNotes] = useState('');
  const [registering, setRegistering] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [releaseModal, setReleaseModal] = useState<'create' | { id: string } | null>(null);
  const [releaseForm, setReleaseForm] = useState({ version: '', title: '', notes: '' });
  const [releaseSaving, setReleaseSaving] = useState(false);

  const fetchVersion = useCallback(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then(setVersionInfo)
      .catch(() => setVersionInfo(null));
  }, []);

  const fetchDeploys = useCallback(
    (page = 1) => {
      const params = new URLSearchParams({ page: String(page) });
      if (deployEnvFilter) params.set('environment', deployEnvFilter);
      fetch(`/api/admin/deploys?${params}`)
        .then((r) => r.json())
        .then((data) =>
          setDeploys({
            items: data.items ?? [],
            total: data.total ?? 0,
            page: data.page ?? 1,
          })
        )
        .catch(() => setDeploys({ items: [], total: 0, page: 1 }));
    },
    [deployEnvFilter]
  );

  const fetchReleases = useCallback((page = 1, search = '') => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    fetch(`/api/admin/releases?${params}`)
      .then((r) => r.json())
      .then((data) =>
        setReleases({
          items: data.items ?? [],
          total: data.total ?? 0,
          page: data.page ?? 1,
        })
      )
      .catch(() => setReleases({ items: [], total: 0, page: 1 }));
  }, []);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);
  useEffect(() => {
    fetchDeploys(deploys.page);
  }, [fetchDeploys, deploys.page]);
  useEffect(() => {
    fetchReleases(releases.page);
  }, [fetchReleases, releases.page]);

  const handleRegisterDeploy = useCallback(async () => {
    setRegistering(true);
    try {
      const res = await fetch('/api/admin/deploys/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: registerNotes.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setRegisterModal(false);
      setRegisterNotes('');
      setToast('Deploy registered');
      fetchDeploys(1);
    } catch (e) {
      setToast((e as Error).message ?? 'Failed');
    } finally {
      setRegistering(false);
    }
  }, [registerNotes, fetchDeploys]);

  const handlePublishToggle = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/releases/${id}/publish`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        setToast('Updated');
        fetchReleases(releases.page);
      } catch {
        setToast('Failed');
      }
    },
    [releases.page, fetchReleases]
  );

  const handleSaveRelease = useCallback(async () => {
    const { version, title, notes } = releaseForm;
    if (!version.trim() || !title.trim()) {
      setToast('Version and title required');
      return;
    }
    setReleaseSaving(true);
    try {
      const editId = releaseModal !== 'create' && releaseModal !== null && typeof releaseModal === 'object' ? releaseModal.id : null;
      const isEdit = !!editId;
      const url = editId ? `/api/admin/releases/${editId}` : '/api/admin/releases';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit ? { version, title, notes } : { version, title, notes, isPublished: false };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setReleaseModal(null);
      setReleaseForm({ version: '', title: '', notes: '' });
      setToast('Saved');
      fetchReleases(releases.page);
    } catch (e) {
      setToast((e as Error).message ?? 'Failed');
    } finally {
      setReleaseSaving(false);
    }
  }, [releaseForm, releaseModal, releases.page, fetchReleases]);

  const handleDeleteRelease = useCallback(
    async (id: string) => {
      if (!window.confirm(t('common.delete') + '?')) return;
      try {
        const res = await fetch(`/api/admin/releases/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        setToast('Deleted');
        fetchReleases(releases.page);
      } catch {
        setToast('Failed');
      }
    },
    [t, releases.page, fetchReleases]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-w-0 p-4 md:p-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('nav.admin.versionDeploys')}</h1>

      {/* Current Build */}
      <OpsCard title="Current Build">
        {versionInfo && (
          <div className="grid gap-2 text-sm">
            <p><span className="font-medium text-slate-600">App Version:</span> {versionInfo.appVersion}</p>
            <p><span className="font-medium text-slate-600">Git Hash:</span> {versionInfo.gitHash || '—'}</p>
            <p><span className="font-medium text-slate-600">Build Date:</span> {versionInfo.buildDate ? formatRiyadh(versionInfo.buildDate) : '—'}</p>
            <p><span className="font-medium text-slate-600">Environment:</span> {versionInfo.environment}</p>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setRegisterModal(true)}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
              >
                Register current deploy
              </button>
            </div>
          </div>
        )}
      </OpsCard>

      {/* Deploy History */}
      <OpsCard title="Deploy History">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Environment:</label>
          <select
            value={deployEnvFilter}
            onChange={(e) => { setDeployEnvFilter(e.target.value); setDeploys((d) => ({ ...d, page: 1 })); }}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="local">local</option>
          </select>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Date</AdminTh>
            <AdminTh>Version</AdminTh>
            <AdminTh>Git Hash</AdminTh>
            <AdminTh>Build Date</AdminTh>
            <AdminTh>Environment</AdminTh>
            <AdminTh>Host</AdminTh>
            <AdminTh>Source</AdminTh>
            <AdminTh>By</AdminTh>
            <AdminTh>Notes</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {deploys.items.map((d) => (
              <tr key={d.id} className="border-b border-slate-100">
                <AdminTd>{formatRiyadh(d.createdAt)}</AdminTd>
                <AdminTd>{d.appVersion}</AdminTd>
                <AdminTd>{d.gitHash}</AdminTd>
                <AdminTd>{formatRiyadh(d.buildDate)}</AdminTd>
                <AdminTd>{d.environment}</AdminTd>
                <AdminTd>{d.serverHost ?? '—'}</AdminTd>
                <AdminTd>{d.deploySource}</AdminTd>
                <AdminTd>{d.deployedByName ?? '—'}</AdminTd>
                <AdminTd className="max-w-[120px] truncate" title={d.notes ?? ''}>{d.notes ?? '—'}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
        {deploys.total > PAGE_SIZE && (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <button
              type="button"
              disabled={deploys.page <= 1}
              onClick={() => setDeploys((d) => ({ ...d, page: d.page - 1 }))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <span>Page {deploys.page} of {Math.ceil(deploys.total / PAGE_SIZE)}</span>
            <button
              type="button"
              disabled={deploys.page >= Math.ceil(deploys.total / PAGE_SIZE)}
              onClick={() => setDeploys((d) => ({ ...d, page: d.page + 1 }))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </OpsCard>

      {/* Release Notes */}
      <OpsCard title="Release Notes">
        <div className="mb-2">
          <button
            type="button"
            onClick={() => { setReleaseModal('create'); setReleaseForm({ version: '', title: '', notes: '' }); }}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create release note
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Version</AdminTh>
            <AdminTh>Title</AdminTh>
            <AdminTh>Notes (preview)</AdminTh>
            <AdminTh>Published</AdminTh>
            <AdminTh>Created</AdminTh>
            <AdminTh>Actions</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {releases.items.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <AdminTd>{r.version}</AdminTd>
                <AdminTd>{r.title}</AdminTd>
                <AdminTd className="max-w-[200px] truncate text-slate-600" title={r.notes}>{r.notes.slice(0, 80)}{r.notes.length > 80 ? '…' : ''}</AdminTd>
                <AdminTd>{r.isPublished ? 'Yes' : 'No'}</AdminTd>
                <AdminTd>{formatRiyadh(r.createdAt)}</AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    onClick={() => handlePublishToggle(r.id)}
                    className="mr-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                  >
                    {r.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReleaseModal({ id: r.id }); setReleaseForm({ version: r.version, title: r.title, notes: r.notes }); }}
                    className="mr-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRelease(r.id)}
                    className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
        {releases.total > PAGE_SIZE && (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <button
              type="button"
              disabled={releases.page <= 1}
              onClick={() => setReleases((r) => ({ ...r, page: r.page - 1 }))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <span>Page {releases.page} of {Math.ceil(releases.total / PAGE_SIZE)}</span>
            <button
              type="button"
              disabled={releases.page >= Math.ceil(releases.total / PAGE_SIZE)}
              onClick={() => setReleases((r) => ({ ...r, page: r.page + 1 }))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </OpsCard>

      {/* Register deploy modal */}
      {registerModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !registering && setRegisterModal(false)} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Register current deploy</h3>
            <p className="mt-1 text-sm text-slate-600">Optional notes:</p>
            <textarea
              value={registerNotes}
              onChange={(e) => setRegisterNotes(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="e.g. Deployed after hotfix"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !registering && setRegisterModal(false)}
                disabled={registering}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleRegisterDeploy}
                disabled={registering}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {registering ? 'Registering…' : 'Register'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Release note create/edit modal */}
      {releaseModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !releaseSaving && setReleaseModal(null)} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">
              {releaseModal === 'create' ? 'Create release note' : 'Edit release note'}
            </h3>
            <div className="mt-3 space-y-2">
              <label className="block text-sm font-medium text-slate-700">Version</label>
              <input
                type="text"
                value={releaseForm.version}
                onChange={(e) => setReleaseForm((f) => ({ ...f, version: e.target.value }))}
                placeholder="1.2.0"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <label className="block text-sm font-medium text-slate-700">Title</label>
              <input
                type="text"
                value={releaseForm.title}
                onChange={(e) => setReleaseForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Operational Hardening"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <label className="block text-sm font-medium text-slate-700">Notes (markdown allowed)</label>
              <textarea
                value={releaseForm.notes}
                onChange={(e) => setReleaseForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                rows={6}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !releaseSaving && setReleaseModal(null)}
                disabled={releaseSaving}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveRelease}
                disabled={releaseSaving}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {releaseSaving ? 'Saving…' : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
