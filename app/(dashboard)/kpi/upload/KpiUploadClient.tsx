'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/providers';
import { OpsCard } from '@/components/ui/OpsCard';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Boutique = { id: string; code: string; name: string };
type Employee = { empId: string; name: string };
type UploadRow = {
  id: string;
  boutiqueId: string;
  empId: string;
  periodKey: string;
  fileName: string;
  status: string;
  errorText: string | null;
  createdAt: string;
  snapshot?: { overallOutOf5: number; salesKpiOutOf5: number; skillsOutOf5: number; companyOutOf5: number };
};

export function KpiUploadClient() {
  const { messages } = useI18n();
  const t = useCallback((key: string) => (getNested(messages, key) as string) || key, [messages]);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [empId, setEmpId] = useState('');
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: string; snapshot?: unknown; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/me/boutiques').then((r) => r.json()),
      fetch('/api/admin/employees').then((r) => (r.ok ? r.json() : [])),
    ]).then(([boutiquesData, empList]) => {
      if (cancelled) return;
      const list = (boutiquesData?.boutiques ?? boutiquesData ?? []) as Boutique[];
      const boutiquesList = Array.isArray(list) ? list : [];
      setBoutiques(boutiquesList);
      setEmployees(Array.isArray(empList) ? empList.map((e: { empId: string; name: string }) => ({ empId: e.empId, name: e.name })) : []);
      setBoutiqueId((prev) => (prev || boutiquesList[0]?.id) ?? '');
    }).catch(() => {}).finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/kpi/uploads')
      .then((r) => (r.ok ? r.json() : { uploads: [] }))
      .then((d) => setUploads(d.uploads ?? []))
      .catch(() => setUploads([]));
  }, [result]);

  const submit = useCallback(() => {
    if (!file || !boutiqueId || !empId || !periodKey.trim()) return;
    setUploading(true);
    setResult(null);
    const form = new FormData();
    form.set('file', file);
    form.set('boutiqueId', boutiqueId);
    form.set('empId', empId);
    form.set('periodKey', periodKey.trim());
    fetch('/api/kpi/uploads', { method: 'POST', body: form })
      .then((r) => r.json())
      .then((data) => {
        setResult({
          ok: data.ok ?? false,
          status: data.status ?? 'FAILED',
          snapshot: data.snapshot,
          error: data.error,
        });
        if (data.ok) setFile(null);
      })
      .catch(() => setResult({ ok: false, status: 'FAILED', error: 'Request failed' }))
      .finally(() => setUploading(false));
  }, [file, boutiqueId, empId, periodKey]);

  if (loading) return <div className="p-4 text-sm text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="min-w-0 p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">{t('kpi.uploadTitle')}</h1>

      <OpsCard title={t('kpi.uploadForm')} className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('kpi.boutique')}</label>
            <select
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('kpi.employee')}</label>
            <select
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.empId} value={e.empId}>{e.name} ({e.empId})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('kpi.periodKey')}</label>
            <input
              type="text"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              placeholder="YYYY or YYYY-MM"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('kpi.file')}</label>
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-700"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={submit}
            disabled={uploading || !file || !empId}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {uploading ? t('common.loading') : t('kpi.upload')}
          </button>
        </div>
        {result && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
            {result.ok ? (
              <div>
                <p>{t('kpi.parsedSuccess')}</p>
                {result.snapshot && typeof result.snapshot === 'object' && 'overallOutOf5' in result.snapshot ? (() => {
                  const s = result.snapshot as { overallOutOf5: number; salesKpiOutOf5: number; skillsOutOf5: number; companyOutOf5: number };
                  return (
                    <p className="mt-2">
                      Overall: {s.overallOutOf5}/5 · Sales: {s.salesKpiOutOf5}/5 · Skills: {s.skillsOutOf5}/5 · Company: {s.companyOutOf5}/5
                    </p>
                  );
                })() : null}
              </div>
            ) : (
              <p>{result.error ?? result.status}</p>
            )}
          </div>
        )}
      </OpsCard>

      <OpsCard title={t('kpi.uploadHistory')}>
        <ul className="space-y-2 text-sm">
          {uploads.length === 0 && <li className="text-slate-500">{t('kpi.noUploads')}</li>}
          {uploads.slice(0, 20).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{u.empId}</span>
              <span>{u.periodKey}</span>
              <span>{u.fileName}</span>
              <span className={u.status === 'PARSED' ? 'text-green-700' : 'text-amber-700'}>{u.status}</span>
              {u.snapshot && <span>({(u.snapshot.overallOutOf5)}/5)</span>}
              {u.errorText && <span className="text-amber-600 truncate max-w-xs" title={u.errorText}>{u.errorText}</span>}
            </li>
          ))}
        </ul>
      </OpsCard>
    </div>
  );
}
