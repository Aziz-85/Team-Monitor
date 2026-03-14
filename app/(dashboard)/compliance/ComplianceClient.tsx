'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { OpsCard } from '@/components/ui/OpsCard';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';
import { CardShell } from '@/components/dashboard/cards/CardShell';

type ComplianceItem = {
  id: string;
  name: string;
  category: string;
  boutiqueId: string;
  boutiqueName: string;
  boutiqueCode: string;
  dateType: string;
  expiryDateGregorian: string;
  expiryDateHijri: string | null;
  expiryDate: string;
  notes: string | null;
  reminderDaysBefore: number;
  daysRemaining: number;
  status: 'expired' | 'urgent' | 'warning' | 'ok';
  attachmentFileName: string | null;
  createdAt: string;
  updatedAt: string;
};

type Boutique = { id: string; name: string; code: string };

type Scope = { boutiqueId: string; boutiqueIds: string[]; boutiques: Boutique[]; canWrite?: boolean };

const CATEGORIES = [
  { value: 'license', key: 'compliance.categoryLicense' },
  { value: 'certificate', key: 'compliance.categoryCertificate' },
  { value: 'safety_equipment', key: 'compliance.categorySafetyEquipment' },
  { value: 'insurance', key: 'compliance.categoryInsurance' },
  { value: 'maintenance', key: 'compliance.categoryMaintenance' },
  { value: 'other', key: 'compliance.categoryOther' },
  // Legacy (for display of existing items)
  { value: 'trade_license', key: 'compliance.categoryTradeLicense' },
  { value: 'municipality', key: 'compliance.categoryMunicipality' },
  { value: 'fire_extinguisher', key: 'compliance.categoryFireExtinguisher' },
  { value: 'civil_defense', key: 'compliance.categoryCivilDefense' },
];

function statusClass(status: string): string {
  switch (status) {
    case 'expired':
      return 'font-bold text-red-600';
    case 'urgent':
      return 'font-semibold text-red-600';
    case 'warning':
      return 'text-amber-600';
    case 'ok':
      return 'text-emerald-600';
    default:
      return 'text-muted';
  }
}

export function ComplianceClient() {
  const { t } = useT();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'trade_license',
    boutiqueId: '',
    dateType: 'GREGORIAN' as 'GREGORIAN' | 'HIJRI',
    expiryDateGregorian: '',
    expiryDateHijri: '',
    notes: '',
  });

  const canWrite = scope?.canWrite ?? false;

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/compliance')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setItems([]);
          setScope(null);
        } else {
          setItems(data.items ?? []);
          setScope(data.scope ?? null);
        }
      })
      .catch(() => {
        setError('Failed to load');
        setItems([]);
        setScope(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (scope && scope.boutiques.length === 1 && showForm && !editingId && !form.boutiqueId) {
      setForm((f) => ({ ...f, boutiqueId: scope.boutiqueId }));
    }
  }, [scope, showForm, editingId, form.boutiqueId]);

  const resetForm = () => {
    setForm({
      name: '',
      category: 'license',
      boutiqueId: scope?.boutiqueId ?? scope?.boutiques?.[0]?.id ?? '',
      dateType: 'GREGORIAN',
      expiryDateGregorian: '',
      expiryDateHijri: '',
      notes: '',
    });
    setShowForm(false);
    setEditingId(null);
  };

  const openAdd = () => {
    const defaultBoutiqueId = scope?.boutiqueId ?? scope?.boutiques?.[0]?.id ?? '';
    setForm({
      name: '',
      category: 'license',
      boutiqueId: defaultBoutiqueId,
      dateType: 'GREGORIAN',
      expiryDateGregorian: '',
      expiryDateHijri: '',
      notes: '',
    });
    setShowForm(true);
    setEditingId(null);
  };

  const openEdit = (item: ComplianceItem) => {
    setForm({
      name: item.name,
      category: item.category,
      boutiqueId: item.boutiqueId,
      dateType: (item.dateType === 'HIJRI' ? 'HIJRI' : 'GREGORIAN') as 'GREGORIAN' | 'HIJRI',
      expiryDateGregorian: item.expiryDateGregorian ?? item.expiryDate ?? '',
      expiryDateHijri: item.expiryDateHijri ?? '',
      notes: item.notes ?? '',
    });
    setShowForm(true);
    setEditingId(item.id);
  };

  const handleFileSelect = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canWrite) return;
    setUploadingId(itemId);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    fetch(`/api/compliance/${itemId}/attach`, { method: 'POST', body: fd })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(data.error || `${t('compliance.uploadFailed')} (${r.status})`);
          return;
        }
        if (data.error) setError(data.error);
        else load();
      })
      .catch((err) => setError(err?.message || t('compliance.uploadFailed')))
      .finally(() => {
        setUploadingId(null);
        e.target.value = '';
      });
  };

  const handleRemoveAttachment = (itemId: string) => {
    if (!confirm(t('compliance.confirmDelete'))) return;
    fetch(`/api/compliance/${itemId}/attach`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else load();
      })
      .catch(() => setError('Failed to remove'));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasDate = form.dateType === 'HIJRI'
      ? form.expiryDateHijri.trim()
      : form.expiryDateGregorian.trim();
    if (!form.name.trim() || !form.category || !form.boutiqueId || !hasDate) return;

    const url = editingId ? `/api/compliance/${editingId}` : '/api/compliance';
    const method = editingId ? 'PATCH' : 'POST';
    const body = form.dateType === 'HIJRI'
      ? { name: form.name.trim(), category: form.category, boutiqueId: form.boutiqueId, dateType: 'HIJRI', expiryDateHijri: form.expiryDateHijri.trim(), notes: form.notes.trim() || null }
      : { name: form.name.trim(), category: form.category, boutiqueId: form.boutiqueId, dateType: 'GREGORIAN', expiryDateGregorian: form.expiryDateGregorian.trim(), notes: form.notes.trim() || null };

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          resetForm();
          load();
        }
      })
      .catch(() => setError('Failed to save'));
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('compliance.confirmDelete'))) return;
    fetch(`/api/compliance/${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else load();
      })
      .catch(() => setError('Failed to delete'));
  };

  const statusKey = (s: string) => {
    switch (s) {
      case 'ok': return 'compliance.statusOk';
      case 'warning': return 'compliance.statusWarning';
      case 'urgent': return 'compliance.statusUrgent';
      case 'expired': return 'compliance.statusExpired';
      default: return 'compliance.statusOk';
    }
  };

  const categoryLabel = (cat: string) => {
    const found = CATEGORIES.find((c) => c.value === cat);
    return found ? t(found.key) : cat;
  };

  if (loading && items.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <OpsCard title={t('compliance.title')}>
        <p className="mb-4 text-sm text-muted">{t('compliance.subtitle')}</p>
        <p className="mb-4 text-xs text-muted">{t('compliance.allowedFormats')}</p>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {canWrite && (
          <div className="mb-6">
            {!showForm ? (
              <button
                type="button"
                onClick={openAdd}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                {t('compliance.addItem')}
              </button>
            ) : (
              <CardShell variant="home" className="mb-4">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                  {editingId ? t('compliance.edit') : t('compliance.addItem')}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.item')}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.category')}</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {t(c.key)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {scope && scope.boutiques.length > 1 && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.branch')}</label>
                      <select
                        value={form.boutiqueId}
                        onChange={(e) => setForm((f) => ({ ...f, boutiqueId: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                      >
                        {scope.boutiques.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {scope && scope.boutiques.length === 1 && (
                    <input type="hidden" name="boutiqueId" value={form.boutiqueId || scope.boutiqueId} readOnly />
                  )}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted">{t('compliance.dateType')}</label>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dateType"
                          value="GREGORIAN"
                          checked={form.dateType === 'GREGORIAN'}
                          onChange={() => setForm((f) => ({ ...f, dateType: 'GREGORIAN' as const, expiryDateHijri: '' }))}
                          className="rounded-full border-border"
                        />
                        <span className="text-sm">{t('compliance.dateTypeGregorian')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dateType"
                          value="HIJRI"
                          checked={form.dateType === 'HIJRI'}
                          onChange={() => setForm((f) => ({ ...f, dateType: 'HIJRI' as const, expiryDateGregorian: '' }))}
                          className="rounded-full border-border"
                        />
                        <span className="text-sm">{t('compliance.dateTypeHijri')}</span>
                      </label>
                    </div>
                  </div>
                  {form.dateType === 'GREGORIAN' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.expiryDate')}</label>
                      <input
                        type="date"
                        value={form.expiryDateGregorian}
                        onChange={(e) => setForm((f) => ({ ...f, expiryDateGregorian: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.expiryDate')} (هجري)</label>
                      <input
                        type="text"
                        value={form.expiryDateHijri}
                        onChange={(e) => setForm((f) => ({ ...f, expiryDateHijri: e.target.value }))}
                        placeholder={t('compliance.hijriDatePlaceholder')}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-muted">{t('compliance.notes')}</label>
                    <input
                      type="text"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
                    >
                      {t('compliance.save')}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-subtle"
                    >
                      {t('compliance.cancel')}
                    </button>
                  </div>
                </form>
              </CardShell>
            )}
          </div>
        )}

        <LuxuryTable>
          <LuxuryTableHead>
            <LuxuryTh>{t('compliance.item')}</LuxuryTh>
            <LuxuryTh>{t('compliance.category')}</LuxuryTh>
            <LuxuryTh>{t('compliance.branch')}</LuxuryTh>
            <LuxuryTh>{t('compliance.expiryDate')}</LuxuryTh>
            <LuxuryTh>{t('compliance.daysLeft')}</LuxuryTh>
            <LuxuryTh>{t('compliance.status')}</LuxuryTh>
            <LuxuryTh>{t('compliance.attachment')}</LuxuryTh>
            {canWrite && <LuxuryTh />}
          </LuxuryTableHead>
          <LuxuryTableBody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <LuxuryTd className="font-medium">{item.name}</LuxuryTd>
                <LuxuryTd>{categoryLabel(item.category)}</LuxuryTd>
                <LuxuryTd>{item.boutiqueName} ({item.boutiqueCode})</LuxuryTd>
                <LuxuryTd>{item.expiryDate}</LuxuryTd>
                <LuxuryTd className="tabular-nums">{item.daysRemaining}</LuxuryTd>
                <LuxuryTd className={statusClass(item.status)}>{t(statusKey(item.status))}</LuxuryTd>
                <LuxuryTd>
                  {item.attachmentFileName ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/compliance/${item.id}/attach`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                      >
                        {t('compliance.viewFile')}
                      </a>
                      <a
                        href={`/api/compliance/${item.id}/attach?download=1`}
                        download={item.attachmentFileName}
                        className="text-sm text-accent hover:underline"
                      >
                        {t('compliance.downloadFile')}
                      </a>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(item.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          {t('compliance.removeFile')}
                        </button>
                      )}
                    </div>
                  ) : canWrite ? (
                    <label className="cursor-pointer text-sm text-accent hover:underline">
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => handleFileSelect(item.id, e)}
                        disabled={!!uploadingId}
                      />
                      {uploadingId === item.id ? t('common.loading') : t('compliance.uploadFile')}
                    </label>
                  ) : (
                    <span className="text-muted text-sm">{t('compliance.noAttachment')}</span>
                  )}
                </LuxuryTd>
                {canWrite && (
                  <LuxuryTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="text-sm text-accent hover:underline"
                      >
                        {t('compliance.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        {t('compliance.delete')}
                      </button>
                    </div>
                  </LuxuryTd>
                )}
              </tr>
            ))}
          </LuxuryTableBody>
        </LuxuryTable>
        {items.length === 0 && !loading && (
          <p className="py-8 text-center text-muted">{t('home.complianceAlertsEmpty')}</p>
        )}
      </OpsCard>
    </div>
  );
}
