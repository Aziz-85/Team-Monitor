'use client';

import { useState, useCallback } from 'react';

type User = { id: string; empId: string; employee?: { name: string } | null };
type Boutique = { id: string; code: string; name: string };

export type MembershipFormValues = {
  userId: string;
  boutiqueId: string;
  role: string;
  canAccess: boolean;
  canManageTasks?: boolean;
  canManageLeaves?: boolean;
  canManageSales?: boolean;
  canManageInventory?: boolean;
};

type MembershipEditorProps = {
  users: User[];
  boutiques: Boutique[];
  onSubmit: (values: MembershipFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  userLabel: string;
  boutiqueLabel: string;
  roleLabel: string;
  canAccessLabel: string;
};

const ROLES = ['EMPLOYEE', 'MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as const;

export function MembershipEditor({
  users,
  boutiques,
  onSubmit,
  onCancel,
  submitLabel,
  userLabel,
  boutiqueLabel,
  roleLabel,
  canAccessLabel,
}: MembershipEditorProps) {
  const [userId, setUserId] = useState('');
  const [boutiqueId, setBoutiqueId] = useState('');
  const [role, setRole] = useState<string>('EMPLOYEE');
  const [canAccess, setCanAccess] = useState(true);
  const [canManageTasks, setCanManageTasks] = useState(false);
  const [canManageLeaves, setCanManageLeaves] = useState(false);
  const [canManageSales, setCanManageSales] = useState(false);
  const [canManageInventory, setCanManageInventory] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userId || !boutiqueId) return;
      setSaving(true);
      try {
        await onSubmit({ userId, boutiqueId, role, canAccess, canManageTasks, canManageLeaves, canManageSales, canManageInventory });
      } finally {
        setSaving(false);
      }
    },
    [userId, boutiqueId, role, canAccess, canManageTasks, canManageLeaves, canManageSales, canManageInventory, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{userLabel}</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          required
        >
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.empId} {u.employee?.name ? `— ${u.employee.name}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{boutiqueLabel}</label>
        <select
          value={boutiqueId}
          onChange={(e) => setBoutiqueId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          required
        >
          <option value="">—</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{roleLabel}</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="membership-canAccess" checked={canAccess} onChange={(e) => setCanAccess(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        <label htmlFor="membership-canAccess" className="text-sm text-slate-700">{canAccessLabel}</label>
      </div>
      {(role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
        <div className="space-y-1 border-t border-slate-200 pt-2">
          <p className="text-xs font-medium text-slate-500">Manager permissions (this boutique)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageTasks} onChange={(e) => setCanManageTasks(e.target.checked)} /> Tasks</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageLeaves} onChange={(e) => setCanManageLeaves(e.target.checked)} /> Leaves</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageSales} onChange={(e) => setCanManageSales(e.target.checked)} /> Sales</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canManageInventory} onChange={(e) => setCanManageInventory(e.target.checked)} /> Inventory</label>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50">
          {saving ? '…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
