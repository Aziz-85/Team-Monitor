'use client';

import { useCallback, useEffect, useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { useI18n } from '@/app/providers';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import type { AdminFilterJson } from '@/lib/scope/adminFilter';
import type { Role } from '@prisma/client';
import { getRoleDisplayLabel } from '@/lib/roleLabel';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type User = {
  id: string;
  empId: string;
  role: string;
  mustChangePassword: boolean;
  disabled: boolean;
  canEditSchedule?: boolean;
  employee?: { name: string } | null;
  membershipsCount?: number;
  primaryBoutique?: { id: string; code: string; name: string } | null;
};

export function AdminUsersClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [list, setList] = useState<User[]>([]);
  const [adminFilter, setAdminFilter] = useState<AdminFilterJson | null>(null);

  const buildParams = useCallback(
    (adminF: AdminFilterJson | null) => {
      const params = new URLSearchParams();
      if (adminF && adminF.kind !== 'ALL') {
        params.set('filterKind', adminF.kind);
        if (adminF.boutiqueId) params.set('boutiqueId', adminF.boutiqueId);
        if (adminF.regionId) params.set('regionId', adminF.regionId);
        if (adminF.groupId) params.set('groupId', adminF.groupId);
      }
      return params;
    },
    []
  );

  const fetchList = useCallback(() => {
    fetch(`/api/admin/users?${buildParams(adminFilter)}`)
      .then((r) => r.json().catch(() => []))
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, [adminFilter, buildParams]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const setUserScheduleEditPermission = useCallback(
    async (empId: string, enabled: boolean) => {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId, canEditSchedule: enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || t('admin.onlyAdminCanChangePermissions'));
        return;
      }
      setList((prev) =>
        prev.map((u) => (u.empId === empId ? { ...u, canEditSchedule: enabled } : u))
      );
    },
    [t]
  );

  const setUserDisabled = useCallback(
    async (empId: string, disabled: boolean) => {
      if (disabled && !window.confirm(t('admin.confirmDisableUser'))) return;
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId, disabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update');
        return;
      }
      setList((prev) =>
        prev.map((u) => (u.empId === empId ? { ...u, disabled } : u))
      );
    },
    [t]
  );

  const deleteUser = useCallback(
    async (empId: string) => {
      if (!window.confirm(t('admin.confirmDeleteUser'))) return;
      const res = await fetch(`/api/admin/users?empId=${encodeURIComponent(empId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || t('admin.cannotDeleteSelf'));
        return;
      }
      setList((prev) => prev.map((u) => (u.empId === empId ? { ...u, disabled: true } : u)));
    },
    [t]
  );

  return (
    <div className="min-w-0 p-4 md:p-6">
      <OpsCard title={t('nav.admin.users')}>
        <p className="mb-2 text-sm text-slate-600">{t('admin.adminFilterLabel')}</p>
        <AdminFilterBar filterLabel={t('admin.adminFilterLabel')} onFilterChange={setAdminFilter} t={t} />
        <LuxuryTable>
          <LuxuryTableHead>
            <LuxuryTh>Emp ID</LuxuryTh>
            <LuxuryTh>{t('common.name')}</LuxuryTh>
            <LuxuryTh>Role</LuxuryTh>
            <LuxuryTh>{t('admin.membershipsCount')}</LuxuryTh>
            <LuxuryTh>{t('admin.primaryBoutique')}</LuxuryTh>
            <LuxuryTh title={t('admin.scheduleEditPermissionHint')}>{t('admin.scheduleEditPermission')}</LuxuryTh>
            <LuxuryTh>Must change password</LuxuryTh>
            <LuxuryTh>Disabled</LuxuryTh>
            <LuxuryTh>{t('common.edit')} / {t('admin.disable')} / {t('admin.deleteUser')}</LuxuryTh>
          </LuxuryTableHead>
          <LuxuryTableBody>
            {list.map((u) => (
              <tr key={u.id}>
                <LuxuryTd>{u.empId}</LuxuryTd>
                <LuxuryTd>{u.employee?.name ?? '—'}</LuxuryTd>
                <LuxuryTd>{getRoleDisplayLabel(u.role as Role, null, t)}</LuxuryTd>
                <LuxuryTd>{u.membershipsCount ?? 0}</LuxuryTd>
                <LuxuryTd>{u.primaryBoutique ? `${u.primaryBoutique.name} (${u.primaryBoutique.code})` : '—'}</LuxuryTd>
                <LuxuryTd>
                  {u.role === 'ASSISTANT_MANAGER' ? (
                    <button
                      type="button"
                      onClick={() => setUserScheduleEditPermission(u.empId, !u.canEditSchedule)}
                      className={`rounded border px-2 py-1 text-sm ${
                        u.canEditSchedule
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {u.canEditSchedule ? t('admin.revoke') : t('admin.grant')}
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </LuxuryTd>
                <LuxuryTd>{u.mustChangePassword ? 'Yes' : 'No'}</LuxuryTd>
                <LuxuryTd>{u.disabled ? 'Yes' : 'No'}</LuxuryTd>
                <LuxuryTd>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setUserDisabled(u.empId, !u.disabled)}
                      className={`rounded border px-2 py-1 text-sm ${
                        u.disabled
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-amber-500 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {u.disabled ? t('admin.enable') : t('admin.disable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(u.empId)}
                      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700"
                    >
                      {t('admin.deleteUser')}
                    </button>
                  </div>
                </LuxuryTd>
              </tr>
            ))}
          </LuxuryTableBody>
        </LuxuryTable>
      </OpsCard>
    </div>
  );
}
