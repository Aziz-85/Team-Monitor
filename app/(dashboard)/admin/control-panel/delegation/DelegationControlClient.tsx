'use client';

import { useCallback, useEffect, useState } from 'react';

type Grant = {
  id: string;
  boutiqueId: string;
  targetUserId: string;
  targetUser: { id: string; empId: string; role: string; employee?: { name: string } | null };
  type: string;
  roleBoost: string | null;
  flags: Record<string, unknown> | null;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: 'active' | 'scheduled' | 'expired';
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  grantedByUser: { id: string; empId: string; employee?: { name: string } | null };
  revokedByUser: { id: string; empId: string; name?: string } | null;
};

type UserOption = { id: string; empId: string; role: string; name: string };

export function DelegationControlClient({
  isAdmin,
  defaultBoutiqueId,
}: {
  isAdmin: boolean;
  defaultBoutiqueId: string;
}) {
  const [boutiqueId, setBoutiqueId] = useState(defaultBoutiqueId);
  const [boutiques, setBoutiques] = useState<{ id: string; code: string; name: string }[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<'active' | 'scheduled' | 'expired' | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGrants = useCallback(() => {
    if (!boutiqueId) return;
    setLoading(true);
    const params = new URLSearchParams({ boutiqueId });
    if (statusFilter) params.set('status', statusFilter);
    fetch(`/api/admin/delegations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setGrants(data.grants ?? []);
        setError(null);
      })
      .catch(() => setError('Failed to load grants'))
      .finally(() => setLoading(false));
  }, [boutiqueId, statusFilter]);

  const fetchUsers = useCallback(() => {
    if (!boutiqueId) return;
    fetch(`/api/admin/delegations/users?boutiqueId=${encodeURIComponent(boutiqueId)}`)
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => setUsers([]));
  }, [boutiqueId]);

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/boutiques')
        .then((r) => r.json())
        .then((data) => setBoutiques(Array.isArray(data) ? data : []))
        .catch(() => setBoutiques([]));
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  useEffect(() => {
    if (drawerOpen && boutiqueId) fetchUsers();
  }, [drawerOpen, boutiqueId, fetchUsers]);

  const handleRevoke = useCallback(
    async (grantId: string, reason: string) => {
      const res = await fetch(`/api/admin/delegations/${grantId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Revoke failed');
        return;
      }
      fetchGrants();
    },
    [fetchGrants]
  );

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-4 text-xl font-semibold">Delegation Control Panel</h1>

      <div className="flex flex-wrap gap-4">
        {isAdmin && (
          <label>
            <span className="mr-2 text-sm">Boutique</span>
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              className="rounded border px-2 py-1"
            >
              <option value="">Select</option>
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="mr-2 text-sm">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border px-2 py-1"
          >
            <option value="">All</option>
            <option value="active">Active now</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded bg-slate-700 px-3 py-1 text-white"
        >
          Create Delegation
        </button>
      </div>

      {error && <p className="mt-2 text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="p-2 text-left">Target</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Role / Flags</th>
              <th className="p-2 text-left">Start</th>
              <th className="p-2 text-left">End</th>
              <th className="p-2 text-left">By</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (
              grants.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="p-2">
                    {g.targetUser?.employee?.name ?? g.targetUser?.empId} ({g.targetUser?.role})
                  </td>
                  <td className="p-2">{g.type}</td>
                  <td className="p-2">
                    {g.type === 'ROLE_BOOST' ? g.roleBoost : JSON.stringify(g.flags ?? {})}
                  </td>
                  <td className="p-2">{new Date(g.startsAt).toLocaleString()}</td>
                  <td className="p-2">{new Date(g.endsAt).toLocaleString()}</td>
                  <td className="p-2">
                    {g.grantedByUser?.employee?.name ?? g.grantedByUser?.empId}
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        g.status === 'active'
                          ? 'text-green-600'
                          : g.status === 'scheduled'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                      }
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="p-2">
                    {g.status === 'active' && !g.revokedAt && (
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Revoke reason (required):');
                          if (reason?.trim()) handleRevoke(g.id, reason.trim());
                        }}
                        className="text-red-600 underline"
                      >
                        Revoke now
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && grants.length === 0 && (
          <p className="p-4 text-slate-500">No grants match the filter.</p>
        )}
      </div>

      {drawerOpen && (
        <CreateDelegationDrawer
          boutiqueId={boutiqueId}
          users={users}
          onClose={() => setDrawerOpen(false)}
          onCreated={() => {
            setDrawerOpen(false);
            fetchGrants();
          }}
        />
      )}
    </div>
  );
}

function CreateDelegationDrawer({
  boutiqueId,
  users,
  onClose,
  onCreated,
}: {
  boutiqueId: string;
  users: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetUserId, setTargetUserId] = useState('');
  const [type, setType] = useState<'ROLE_BOOST' | 'PERMISSION_FLAGS'>('ROLE_BOOST');
  const [roleBoost, setRoleBoost] = useState<'ASSISTANT_MANAGER' | 'MANAGER'>('MANAGER');
  const [flags, setFlags] = useState<Record<string, boolean>>({
    canApproveLeaveRequests: false,
    canApproveRequests: false,
    canEditSchedule: false,
    canApproveWeek: false,
  });
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Reason is required');
      return;
    }
    if (!targetUserId) {
      alert('Select a target user');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        boutiqueId,
        targetUserId,
        type,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim(),
      };
      if (type === 'ROLE_BOOST') body.roleBoost = roleBoost;
      else body.flags = flags;
      const res = await fetch('/api/admin/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Create failed');
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Create Delegation</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Target user</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
              required
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.empId}) — {u.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Mode</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'ROLE_BOOST' | 'PERMISSION_FLAGS')}
              className="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="ROLE_BOOST">Role boost</option>
              <option value="PERMISSION_FLAGS">Custom flags</option>
            </select>
          </div>
          {type === 'ROLE_BOOST' && (
            <div>
              <label className="block text-sm font-medium">Role boost</label>
              <select
                value={roleBoost}
                onChange={(e) => setRoleBoost(e.target.value as 'ASSISTANT_MANAGER' | 'MANAGER')}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="ASSISTANT_MANAGER">ASSISTANT_MANAGER</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>
          )}
          {type === 'PERMISSION_FLAGS' && (
            <div>
              <label className="block text-sm font-medium">Flags</label>
              <div className="mt-1 space-y-1">
                {(['canApproveLeaveRequests', 'canApproveRequests', 'canEditSchedule', 'canApproveWeek'] as const).map(
                  (k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={flags[k] ?? false}
                        onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))}
                      />
                      <span>{k}</span>
                    </label>
                  )
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium">Start</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">End</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Reason (required)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="rounded border px-3 py-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
