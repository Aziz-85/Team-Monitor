'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatSarFromHalala } from '@/lib/utils/money';
import { useT } from '@/lib/i18n/useT';
import {
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableTd,
} from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';

type ReturnItem = {
  id: string;
  txnDate: string;
  boutiqueId: string;
  employeeId: string;
  employeeName: string;
  type: string;
  referenceNo: string | null;
  lineNo: string | null;
  netAmount: number;
  originalTxnId: string | null;
  editable?: boolean;
};

type EmployeeOption = { empId: string; name: string };

type EditDraft = {
  id: string;
  type: 'RETURN' | 'EXCHANGE';
  txnDate: string;
  employeeId: string;
  amount: string;
  referenceNo: string;
  originalTxnId: string;
};

export function SalesReturnsClient() {
  const { t } = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formType, setFormType] = useState<'RETURN' | 'EXCHANGE'>('RETURN');
  const [formDate, setFormDate] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formReferenceNo, setFormReferenceNo] = useState('');
  const [formOriginalTxnId, setFormOriginalTxnId] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    setTo(end.toISOString().slice(0, 10));
    setFrom(start.toISOString().slice(0, 10));
    setFormDate(end.toISOString().slice(0, 10));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/metrics/returns?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? t('sales.returns.failedToLoad'));
        return;
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setCanAdd(!!data.canAdd);
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    if (from && to) load();
  }, [from, to, load]);

  useEffect(() => {
    if (!canAdd) return;
    fetch('/api/leaves/employees', { cache: 'no-store' })
      .then((r) => r.json())
      .then((list: EmployeeOption[]) => setEmployees(Array.isArray(list) ? list : []))
      .catch(() => setEmployees([]));
  }, [canAdd]);

  const openEdit = (r: ReturnItem) => {
    if (!canAdd || r.editable !== true) return;
    setEditError(null);
    const type = r.type === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN';
    setEditDraft({
      id: r.id,
      type,
      txnDate: r.txnDate,
      employeeId: r.employeeId,
      amount: (Math.abs(r.netAmount) / 100).toFixed(2),
      referenceNo: r.referenceNo ?? '',
      originalTxnId: r.originalTxnId ?? '',
    });
  };

  const cancelEdit = () => {
    setEditDraft(null);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    const amount = parseFloat(editDraft.amount);
    if (
      !editDraft.txnDate ||
      !editDraft.employeeId ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setEditError(t('sales.returns.pleaseFillDateEmployeeAmount'));
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/sales/returns/${encodeURIComponent(editDraft.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editDraft.type,
          txnDate: editDraft.txnDate,
          employeeId: editDraft.employeeId,
          amountSar: amount,
          referenceNo: editDraft.referenceNo.trim() || undefined,
          originalTxnId: editDraft.originalTxnId.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          j.error === 'Only manually entered rows can be edited here'
            ? t('sales.returns.cannotEditImportedHint')
            : typeof j.error === 'string'
              ? j.error
              : t('sales.returns.failedToUpdate');
        setEditError(msg);
        return;
      }
      cancelEdit();
      load();
    } finally {
      setEditSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount);
    if (!formDate || !formEmployeeId || !Number.isFinite(amount) || amount <= 0) {
      setSubmitError(t('sales.returns.pleaseFillDateEmployeeAmount'));
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/sales/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          txnDate: formDate,
          employeeId: formEmployeeId,
          amountSar: amount,
          referenceNo: formReferenceNo.trim() || undefined,
          originalTxnId: formOriginalTxnId.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(j.error ?? t('sales.returns.failedToAdd'));
        return;
      }
      setFormAmount('');
      setFormReferenceNo('');
      setFormOriginalTxnId('');
      load();
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">{t('sales.returns.title')}</h1>

      {canAdd && (
        <section className="rounded-lg border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t('sales.returns.addReturnOrExchange')}</h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.type')}</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'RETURN' | 'EXCHANGE')}
                className="rounded border border-border px-2 py-1.5 text-sm"
              >
                <option value="RETURN">{t('sales.returns.return')}</option>
                <option value="EXCHANGE">{t('sales.returns.exchange')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.date')}</span>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded border border-border px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.employee')}</span>
              <select
                value={formEmployeeId}
                onChange={(e) => setFormEmployeeId(e.target.value)}
                className="min-w-[140px] rounded border border-border px-2 py-1.5 text-sm"
                required
              >
                <option value="">{t('sales.returns.selectPlaceholder')}</option>
                {employees.map((emp) => (
                  <option key={emp.empId} value={emp.empId}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.amountSar')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="w-24 rounded border border-border px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.referenceOptional')}</span>
              <input
                type="text"
                value={formReferenceNo}
                onChange={(e) => setFormReferenceNo(e.target.value)}
                className="w-32 rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.originalTxnIdOptional')}</span>
              <input
                type="text"
                value={formOriginalTxnId}
                onChange={(e) => setFormOriginalTxnId(e.target.value)}
                className="w-36 rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={submitLoading}
              className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {submitLoading ? t('sales.returns.adding') : t('sales.returns.add')}
            </button>
          </form>
          {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
        </section>
      )}

      {editDraft && canAdd && (
        <section className="rounded-lg border border-accent/40 bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t('sales.returns.editReturnOrExchange')}</h2>
          <form onSubmit={handleEditSubmit} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.type')}</span>
              <select
                value={editDraft.type}
                onChange={(e) =>
                  setEditDraft((d) =>
                    d ? { ...d, type: e.target.value as 'RETURN' | 'EXCHANGE' } : d
                  )
                }
                className="rounded border border-border px-2 py-1.5 text-sm"
              >
                <option value="RETURN">{t('sales.returns.return')}</option>
                <option value="EXCHANGE">{t('sales.returns.exchange')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.date')}</span>
              <input
                type="date"
                value={editDraft.txnDate}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, txnDate: e.target.value } : d))
                }
                className="rounded border border-border px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.employee')}</span>
              <select
                value={editDraft.employeeId}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, employeeId: e.target.value } : d))
                }
                className="min-w-[140px] rounded border border-border px-2 py-1.5 text-sm"
                required
              >
                <option value="">{t('sales.returns.selectPlaceholder')}</option>
                {employees.map((emp) => (
                  <option key={emp.empId} value={emp.empId}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.amountSar')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editDraft.amount}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, amount: e.target.value } : d))
                }
                className="w-24 rounded border border-border px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.referenceOptional')}</span>
              <input
                type="text"
                value={editDraft.referenceNo}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, referenceNo: e.target.value } : d))
                }
                className="w-32 rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('sales.returns.originalTxnIdOptional')}</span>
              <input
                type="text"
                value={editDraft.originalTxnId}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, originalTxnId: e.target.value } : d))
                }
                className="w-36 rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={editSaving}
              className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {editSaving ? t('sales.returns.saving') : t('sales.returns.save')}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={editSaving}
              className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
            >
              {t('sales.returns.cancel')}
            </button>
          </form>
          {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded bg-accent px-3 py-1 text-white disabled:opacity-50"
        >
          {loading ? t('sales.returns.loading') : t('sales.returns.apply')}
        </button>
      </div>
      {error && <p className="text-sm text-luxury-error">{error}</p>}
      {canAdd && items.some((r) => r.editable === false) ? (
        <p className="text-xs text-muted">{t('sales.returns.cannotEditImportedHint')}</p>
      ) : null}
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {items.length === 0 && !loading ? (
          <EmptyState title={t('sales.returns.noReturnsInPeriod')} />
        ) : (
          <DataTable variant="luxury" zebra>
            <DataTableHead>
              <DataTableTh className="text-start">{t('sales.returns.dateCol')}</DataTableTh>
              <DataTableTh className="text-start">{t('sales.returns.employeeCol')}</DataTableTh>
              <DataTableTh className="text-start">{t('sales.returns.typeCol')}</DataTableTh>
              <DataTableTh className="text-start">{t('sales.returns.referenceCol')}</DataTableTh>
              <DataTableTh className="text-end">{t('sales.returns.netSarCol')}</DataTableTh>
              <DataTableTh className="text-start">{t('sales.returns.originalTxnCol')}</DataTableTh>
              {canAdd ? (
                <DataTableTh className="text-end">{t('sales.returns.actionsCol')}</DataTableTh>
              ) : null}
            </DataTableHead>
            <DataTableBody>
              {items.map((r) => (
                <tr key={r.id}>
                  <DataTableTd>{r.txnDate}</DataTableTd>
                  <DataTableTd>{r.employeeName}</DataTableTd>
                  <DataTableTd>{r.type}</DataTableTd>
                  <DataTableTd>{r.referenceNo ?? '—'}</DataTableTd>
                  <DataTableTd className="text-end">{formatSarFromHalala(r.netAmount)}</DataTableTd>
                  <DataTableTd>{r.originalTxnId ? t('sales.returns.linked') : '—'}</DataTableTd>
                  {canAdd ? (
                    <DataTableTd className="text-end">
                      {r.editable === true ? (
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {t('sales.returns.edit')}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </DataTableTd>
                  ) : null}
                </tr>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
