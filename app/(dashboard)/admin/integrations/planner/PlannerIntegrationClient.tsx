'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { AdminDataTable, AdminTableHead, AdminTh, AdminTableBody, AdminTd } from '@/components/admin/AdminDataTable';
import { Modal } from '@/components/admin/Modal';

const WEBHOOK_SECRET_HEADER = 'x-planner-webhook-secret';
const EXAMPLE_PAYLOAD = {
  eventType: 'task.created',
  eventId: 'flow-run-id-or-guid',
  mode: 'POWER_AUTOMATE',
  planId: 'plan-id',
  bucketId: 'bucket-id',
  taskId: 'external-task-id',
  title: 'Task title',
  description: 'Description',
  percentComplete: 0,
  isCompleted: false,
  dueDateTime: '2026-03-10T00:00:00Z',
  assignedUsers: [{ id: 'user-id', email: 'user@example.com', displayName: 'User Name' }],
  sourceUpdatedAt: new Date().toISOString(),
};

type Integration = {
  id: string;
  boutiqueId: string | null;
  mode: string;
  enabled: boolean;
  syncDirection: string;
  planName: string | null;
  planExternalId: string | null;
  graphConnectionStatus: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  webhookSecret?: string | null;
};

type UserMap = {
  id: string;
  boutiqueId: string | null;
  microsoftUserId: string | null;
  microsoftEmail: string | null;
  microsoftDisplayName: string | null;
  employeeId: string;
  employee?: { empId: string; name: string; boutiqueId: string | null };
};

type BucketMap = {
  id: string;
  integrationId: string;
  externalBucketId: string;
  externalBucketName: string;
  localTaskType: string | null;
  localZone: string | null;
  localPriority: number | null;
  integration?: { id: string; planName: string | null };
};

type Log = {
  id: string;
  integrationId: string | null;
  direction: string;
  mode: string;
  eventType: string;
  status: string;
  relatedLocalTaskId: string | null;
  relatedExternalTaskId: string | null;
  message: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  createdAt: string;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-subtle"
      title={`Copy ${label}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function PlannerIntegrationClient() {
  const { t } = useT();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [userMaps, setUserMaps] = useState<UserMap[]>([]);
  const [bucketMaps, setBucketMaps] = useState<BucketMap[]>([]);
  const [graphConfigured, setGraphConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testPayload, setTestPayload] = useState(JSON.stringify(EXAMPLE_PAYLOAD, null, 2));
  const [testResult, setTestResult] = useState<{ ok: boolean; eventHash?: string; normalized?: unknown; parseError?: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [userMapModal, setUserMapModal] = useState<'add' | 'edit' | null>(null);
  const [bucketMapModal, setBucketMapModal] = useState<'add' | 'edit' | null>(null);
  const [editingUserMap, setEditingUserMap] = useState<UserMap | null>(null);
  const [editingBucketMap, setEditingBucketMap] = useState<BucketMap | null>(null);
  const [employees, setEmployees] = useState<Array<{ empId: string; name: string }>>([]);

  const fetchData = useCallback(() => {
    setLoading(true);
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/integrations/planner/webhook`);
    }
    Promise.all([
      fetch('/api/integrations/planner').then((r) => r.json()),
      fetch('/api/integrations/planner/mappings').then((r) => r.json()),
      fetch('/api/integrations/planner/logs?limit=50').then((r) => r.json()),
      fetch('/api/admin/employees').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([data, mappingsData, logsData, empData]) => {
        setIntegrations(data.integrations ?? []);
        setGraphConfigured(data.graphConfigured ?? false);
        setUserMaps(mappingsData.userMaps ?? []);
        setBucketMaps(mappingsData.bucketMaps ?? []);
        setLogs(logsData.logs ?? []);
        setEmployees(Array.isArray(empData) ? empData.map((e: { empId: string; name?: string }) => ({ empId: e.empId, name: e.name ?? e.empId })) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReconcile = useCallback(async () => {
    const res = await fetch('/api/integrations/planner/reconcile', { method: 'POST' });
    if (res.ok) fetchData();
  }, [fetchData]);

  const handleTestPayload = useCallback(async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(testPayload);
      } catch {
        setTestResult({ ok: false, parseError: 'Invalid JSON' });
        return;
      }
      const res = await fetch('/api/integrations/planner/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, parseError: 'Request failed' });
    } finally {
      setTestLoading(false);
    }
  }, [testPayload]);

  const handleSaveUserMap = useCallback(
    async (values: { employeeId: string; microsoftEmail?: string; microsoftDisplayName?: string }) => {
      const body = editingUserMap
        ? { id: editingUserMap.id, employeeId: values.employeeId, microsoftEmail: values.microsoftEmail ?? null, microsoftDisplayName: values.microsoftDisplayName ?? null }
        : { employeeId: values.employeeId, microsoftEmail: values.microsoftEmail ?? null, microsoftDisplayName: values.microsoftDisplayName ?? null };
      const res = await fetch('/api/integrations/planner/mappings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setUserMapModal(null);
      setEditingUserMap(null);
      fetchData();
    },
    [editingUserMap, fetchData]
  );

  const handleSaveBucketMap = useCallback(
    async (values: { integrationId: string; externalBucketId: string; externalBucketName: string; localTaskType?: string; localZone?: string; localPriority?: number }) => {
      const body = editingBucketMap
        ? {
            id: editingBucketMap.id,
            integrationId: values.integrationId,
            externalBucketId: values.externalBucketId,
            externalBucketName: values.externalBucketName,
            localTaskType: values.localTaskType || null,
            localZone: values.localZone || null,
            localPriority: values.localPriority ?? null,
          }
        : {
            integrationId: values.integrationId,
            externalBucketId: values.externalBucketId,
            externalBucketName: values.externalBucketName,
            localTaskType: values.localTaskType || null,
            localZone: values.localZone || null,
            localPriority: values.localPriority ?? null,
          };
      const res = await fetch('/api/integrations/planner/mappings/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setBucketMapModal(null);
      setEditingBucketMap(null);
      fetchData();
    },
    [editingBucketMap, fetchData]
  );

  if (loading) {
    return (
      <div className="min-w-0 p-4 md:p-6">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  const powerAutomateIntegration = integrations.find((i) => i.mode === 'POWER_AUTOMATE' && i.enabled);

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-semibold text-foreground">{t('nav.plannerIntegration')}</h1>

      <OpsCard title={t('admin.planner.overview') ?? 'Integration Overview'} className="rounded-xl border border-border">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-muted">Graph API</p>
            <p className="text-foreground">{graphConfigured ? 'Configured' : 'Not configured'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted">Integrations</p>
            <p className="text-foreground">{integrations.length}</p>
          </div>
        </div>
      </OpsCard>

      {!powerAutomateIntegration && (
        <OpsCard title="Add Power Automate integration" className="rounded-xl border border-border">
          <IntegrationForm onSuccess={fetchData} />
        </OpsCard>
      )}

      {powerAutomateIntegration && (
        <OpsCard title="Webhook (Power Automate)" className="rounded-xl border border-border">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase text-muted">Webhook URL</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs">{webhookUrl || '/api/integrations/planner/webhook'}</code>
                <CopyButton text={webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/planner/webhook`} label="URL" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted">Required header</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">{WEBHOOK_SECRET_HEADER}</code>
                <CopyButton text={WEBHOOK_SECRET_HEADER} label="header name" />
              </div>
              <p className="mt-1 text-xs text-muted">Value must match the webhook secret configured for this integration.</p>
            </div>
          </div>
        </OpsCard>
      )}

      <OpsCard title="Test payload helper" className="rounded-xl border border-border">
        <p className="mb-2 text-sm text-muted">Paste or edit a Power Automate payload below, then click Test to validate (dry-run).</p>
        <textarea
          value={testPayload}
          onChange={(e) => setTestPayload(e.target.value)}
          className="mb-2 w-full rounded border border-border bg-surface px-3 py-2 font-mono text-xs"
          rows={12}
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestPayload}
            disabled={testLoading}
            className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {testLoading ? 'Testing…' : 'Test payload'}
          </button>
          {testResult && (
            <span className={testResult.ok ? 'text-green-600' : 'text-amber-600'}>
              {testResult.ok ? `OK — eventHash: ${testResult.eventHash ?? '—'}` : testResult.parseError ?? 'Parse error'}
            </span>
          )}
        </div>
        {testResult?.normalized != null ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-xs">{JSON.stringify(testResult.normalized as object, null, 2)}</pre>
        ) : null}
      </OpsCard>

      <OpsCard title="User mappings (Microsoft → Employee)" className="rounded-xl border border-border">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              setEditingUserMap(null);
              setUserMapModal('add');
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
          >
            {t('common.add')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Microsoft email</AdminTh>
            <AdminTh>Employee</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {userMaps.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted">
                  —
                </td>
              </tr>
            ) : (
              userMaps.map((um) => (
                <tr key={um.id}>
                  <AdminTd>{um.microsoftEmail ?? um.microsoftDisplayName ?? '—'}</AdminTd>
                  <AdminTd>{um.employee?.name ?? um.employeeId}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserMap(um);
                        setUserMapModal('edit');
                      }}
                      className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-subtle"
                    >
                      {t('common.edit')}
                    </button>
                  </AdminTd>
                </tr>
              ))
            )}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <OpsCard title="Bucket mappings (Planner bucket → local)" className="rounded-xl border border-border">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              setEditingBucketMap(null);
              setBucketMapModal('add');
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
          >
            {t('common.add')}
          </button>
        </div>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Bucket</AdminTh>
            <AdminTh>Plan</AdminTh>
            <AdminTh>Local type/zone</AdminTh>
            <AdminTh>{t('common.edit')}</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {bucketMaps.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  —
                </td>
              </tr>
            ) : (
              bucketMaps.map((bm) => (
                <tr key={bm.id}>
                  <AdminTd>{bm.externalBucketName}</AdminTd>
                  <AdminTd>{bm.integration?.planName ?? bm.integrationId}</AdminTd>
                  <AdminTd>{[bm.localTaskType, bm.localZone].filter(Boolean).join(' / ') || '—'}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBucketMap(bm);
                        setBucketMapModal('edit');
                      }}
                      className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-surface-subtle"
                    >
                      {t('common.edit')}
                    </button>
                  </AdminTd>
                </tr>
              ))
            )}
          </AdminTableBody>
        </AdminDataTable>
      </OpsCard>

      <OpsCard title={t('admin.planner.actions') ?? 'Actions'} className="rounded-xl border border-border">
        <div className="flex flex-wrap gap-2">
          <a
            href="/sync/planner"
            className="rounded border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
          >
            {t('nav.syncPlanner')}
          </a>
          <button
            type="button"
            onClick={handleReconcile}
            className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            {t('admin.planner.runReconcile') ?? 'Run reconciliation'}
          </button>
        </div>
      </OpsCard>

      <OpsCard title={t('admin.planner.logs') ?? 'Sync logs'} className="rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-start text-muted">Dir</th>
                <th className="px-3 py-2 text-start text-muted">Event</th>
                <th className="px-3 py-2 text-start text-muted">Status</th>
                <th className="px-3 py-2 text-start text-muted">Local task</th>
                <th className="px-3 py-2 text-start text-muted">External task</th>
                <th className="px-3 py-2 text-start text-muted">Message</th>
                <th className="px-3 py-2 text-start text-muted">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted">
                    —
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border">
                    <td className="px-3 py-2 text-foreground">{log.direction}</td>
                    <td className="px-3 py-2 text-foreground">{log.eventType}</td>
                    <td className="px-3 py-2">{log.status}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{log.relatedLocalTaskId ? log.relatedLocalTaskId.slice(0, 8) + '…' : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{log.relatedExternalTaskId ?? '—'}</td>
                    <td className="px-3 py-2 text-muted max-w-[200px] truncate" title={log.message ?? undefined}>{log.message ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </OpsCard>

      {userMapModal && (
        <Modal
          open={!!userMapModal}
          onClose={() => {
            setUserMapModal(null);
            setEditingUserMap(null);
          }}
          title={editingUserMap ? 'Edit user map' : 'Add user map'}
        >
          <UserMapForm
            employees={employees}
            initial={editingUserMap ? { employeeId: editingUserMap.employeeId, microsoftEmail: editingUserMap.microsoftEmail ?? '', microsoftDisplayName: editingUserMap.microsoftDisplayName ?? '' } : undefined}
            onSubmit={handleSaveUserMap}
            onCancel={() => {
              setUserMapModal(null);
              setEditingUserMap(null);
            }}
          />
        </Modal>
      )}

      {bucketMapModal && (
        <Modal
          open={!!bucketMapModal}
          onClose={() => {
            setBucketMapModal(null);
            setEditingBucketMap(null);
          }}
          title={editingBucketMap ? 'Edit bucket map' : 'Add bucket map'}
        >
          <BucketMapForm
            integrations={integrations}
            initial={
              editingBucketMap
                ? {
                    integrationId: editingBucketMap.integrationId,
                    externalBucketId: editingBucketMap.externalBucketId,
                    externalBucketName: editingBucketMap.externalBucketName,
                    localTaskType: editingBucketMap.localTaskType ?? '',
                    localZone: editingBucketMap.localZone ?? '',
                    localPriority: editingBucketMap.localPriority ?? undefined,
                  }
                : undefined
            }
            onSubmit={handleSaveBucketMap}
            onCancel={() => {
              setBucketMapModal(null);
              setEditingBucketMap(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function IntegrationForm({ onSuccess }: { onSuccess: () => void }) {
  const [boutiqueId, setBoutiqueId] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [planName, setPlanName] = useState('');
  const [boutiques, setBoutiques] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/boutiques')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setBoutiques(Array.isArray(data) ? data : []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookSecret.trim()) {
      setError('Webhook secret required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'POWER_AUTOMATE',
          enabled: true,
          webhookSecret: webhookSecret.trim(),
          boutiqueId: boutiqueId || null,
          planName: planName.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground">Boutique (optional)</label>
        <select value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)} className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm">
          <option value="">—</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Webhook secret</label>
        <input
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder="Strong random string"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Plan name (optional)</label>
        <input
          type="text"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="e.g. DHTasks Plan"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <button type="submit" disabled={saving} className="rounded bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50">
        {saving ? 'Creating…' : 'Create integration'}
      </button>
    </form>
  );
}

function UserMapForm({
  employees,
  initial,
  onSubmit,
  onCancel,
}: {
  employees: Array<{ empId: string; name: string }>;
  initial?: { employeeId: string; microsoftEmail?: string; microsoftDisplayName?: string };
  onSubmit: (v: { employeeId: string; microsoftEmail?: string; microsoftDisplayName?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const initialInList = initial?.employeeId && employees.some((e) => e.empId === initial.employeeId);
  const [employeeId, setEmployeeId] = useState(initialInList ? initial!.employeeId : initial?.employeeId ? '__custom__' : '');
  const [customEmpId, setCustomEmpId] = useState(initial?.employeeId && !initialInList ? initial.employeeId : '');
  const [microsoftEmail, setMicrosoftEmail] = useState(initial?.microsoftEmail ?? '');
  const [microsoftDisplayName, setMicrosoftDisplayName] = useState(initial?.microsoftDisplayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveEmployeeId = employeeId === '__custom__' ? customEmpId.trim() : employeeId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveEmployeeId) {
      setError('Employee required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ employeeId: effectiveEmployeeId, microsoftEmail: microsoftEmail.trim() || undefined, microsoftDisplayName: microsoftDisplayName.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground">Employee</label>
        <select
          value={employees.some((e) => e.empId === employeeId) || employeeId === '__custom__' ? employeeId : '__custom__'}
          onChange={(e) => {
            const v = e.target.value;
            setEmployeeId(v);
            if (v !== '__custom__') setCustomEmpId('');
          }}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          required
        >
          <option value="">Select…</option>
          {employees.map((e) => (
            <option key={e.empId} value={e.empId}>
              {e.name} ({e.empId})
            </option>
          ))}
          <option value="__custom__">Other (enter empId)</option>
        </select>
        {employeeId === '__custom__' && (
          <input
            type="text"
            value={customEmpId}
            onChange={(e) => setCustomEmpId(e.target.value)}
            placeholder="Employee ID (empId)"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Microsoft email</label>
        <input
          type="text"
          value={microsoftEmail}
          onChange={(e) => setMicrosoftEmail(e.target.value)}
          placeholder="user@example.com"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Microsoft display name</label>
        <input
          type="text"
          value={microsoftDisplayName}
          onChange={(e) => setMicrosoftDisplayName(e.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-subtle">
          Cancel
        </button>
      </div>
    </form>
  );
}

function BucketMapForm({
  integrations,
  initial,
  onSubmit,
  onCancel,
}: {
  integrations: Integration[];
  initial?: { integrationId: string; externalBucketId: string; externalBucketName: string; localTaskType?: string; localZone?: string; localPriority?: number };
  onSubmit: (v: { integrationId: string; externalBucketId: string; externalBucketName: string; localTaskType?: string; localZone?: string; localPriority?: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [integrationId, setIntegrationId] = useState(initial?.integrationId ?? '');
  const [externalBucketId, setExternalBucketId] = useState(initial?.externalBucketId ?? '');
  const [externalBucketName, setExternalBucketName] = useState(initial?.externalBucketName ?? '');
  const [localTaskType, setLocalTaskType] = useState(initial?.localTaskType ?? '');
  const [localZone, setLocalZone] = useState(initial?.localZone ?? '');
  const [localPriority, setLocalPriority] = useState(initial?.localPriority ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integrationId || !externalBucketId.trim() || !externalBucketName.trim()) {
      setError('Integration, bucket ID and name required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        integrationId,
        externalBucketId: externalBucketId.trim(),
        externalBucketName: externalBucketName.trim(),
        localTaskType: localTaskType.trim() || undefined,
        localZone: localZone.trim() || undefined,
        localPriority: localPriority ? parseInt(String(localPriority), 10) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground">Integration</label>
        <select
          value={integrationId}
          onChange={(e) => setIntegrationId(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          required
        >
          <option value="">Select…</option>
          {integrations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.planName ?? i.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">External bucket ID</label>
        <input
          type="text"
          value={externalBucketId}
          onChange={(e) => setExternalBucketId(e.target.value)}
          placeholder="Planner bucket ID"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">External bucket name</label>
        <input
          type="text"
          value={externalBucketName}
          onChange={(e) => setExternalBucketName(e.target.value)}
          placeholder="e.g. To Do"
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Local task type (optional)</label>
        <input
          type="text"
          value={localTaskType}
          onChange={(e) => setLocalTaskType(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Local zone (optional)</label>
        <input
          type="text"
          value={localZone}
          onChange={(e) => setLocalZone(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Local priority (optional)</label>
        <input
          type="number"
          value={localPriority}
          onChange={(e) => setLocalPriority(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-subtle">
          Cancel
        </button>
      </div>
    </form>
  );
}
