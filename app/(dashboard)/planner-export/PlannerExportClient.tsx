'use client';

import { useState } from 'react';
import { OpsCard } from '@/components/ui/OpsCard';
import { useI18n } from '@/app/providers';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type PlannerRow = { Title: string; AssignedTo: string; 'Start Date': string; 'Due Date': string; Notes: string };

export function PlannerExportClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const [scheduleFrom, setScheduleFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleTo, setScheduleTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [boutiqueOnly, setBoutiqueOnly] = useState(false);
  const [rashidOnly, setRashidOnly] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<PlannerRow[] | null>(null);
  const [scheduleGovernance, setScheduleGovernance] = useState<{
    exportedBy: string;
    exportedAt: string;
    exportTimestampLocal?: string;
    weeks: Array<{
      weekStart: string;
      status: string;
      lockStatus: string;
      lockedByName: string | null;
      lockedByRole: string | null;
      lockedAt: string | null;
      approvedByName: string | null;
      approvedByRole: string | null;
      approvedAt: string | null;
    }>;
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `planner-export-${from}-${to}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const handleSchedulePreview = async () => {
    setScheduleLoading(true);
    setSchedulePreview(null);
    try {
      const res = await fetch('/api/planner/export/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: scheduleFrom,
          to: scheduleTo,
          boutiqueOnly,
          rashidOnly,
          format: 'json',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Preview failed');
        return;
      }
      const data = await res.json();
      setSchedulePreview(data.rows ?? []);
      setScheduleGovernance(data.governance ?? null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleScheduleDownload = async () => {
    setScheduleLoading(true);
    try {
      const res = await fetch('/api/planner/export/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: scheduleFrom,
          to: scheduleTo,
          boutiqueOnly,
          rashidOnly,
          format: 'csv',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `planner-schedule-${scheduleFrom}-${scheduleTo}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <OpsCard title={t('planner.export')}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="mr-2 text-base font-medium">{t('common.from')}</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="mr-2 text-base font-medium">{t('common.to')}</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
            </div>
            <p className="text-base text-slate-600">
              {t('planner.preview')}: {from} → {to}. {t('planner.totalTasks')} per day; CSV includes Start/Due date and Notes.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading}
              className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? '…' : t('planner.download')}
            </button>
          </div>
        </OpsCard>

        <OpsCard title={t('planner.scheduleExport') ?? 'Schedule shifts export'}>
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">{t('planner.taskTemplatePreview') ?? 'Task naming template'}</p>
            <ul className="list-inside list-disc text-sm text-slate-600">
              <li>[Boutique] Morning – {'{{date}}'}</li>
              <li>[Boutique] Evening – {'{{date}}'}</li>
              <li>[Rashid] Morning Coverage – {'{{date}}'}</li>
              <li>[Rashid] Evening Coverage – {'{{date}}'}</li>
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="mr-2 text-base font-medium">{t('common.from')}</label>
                <input
                  type="date"
                  value={scheduleFrom}
                  onChange={(e) => setScheduleFrom(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="mr-2 text-base font-medium">{t('common.to')}</label>
                <input
                  type="date"
                  value={scheduleTo}
                  onChange={(e) => setScheduleTo(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={boutiqueOnly} onChange={(e) => setBoutiqueOnly(e.target.checked)} className="rounded" />
                <span className="text-sm">{t('planner.filterBoutiqueOnly') ?? 'Boutique only'}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={rashidOnly} onChange={(e) => setRashidOnly(e.target.checked)} className="rounded" />
                <span className="text-sm">{t('planner.filterRashidOnly') ?? 'Rashid coverage only'}</span>
              </label>
            </div>
            <p className="text-sm text-slate-600">
              {t('planner.scheduleExportHint') ?? 'Task titles: [Boutique] Morning/Evening Shift – date, [Rashid] Morning/Evening Coverage – date.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSchedulePreview}
                disabled={scheduleLoading}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {scheduleLoading ? '…' : (t('planner.preview') ?? 'Preview')}
              </button>
              <button
                type="button"
                onClick={handleScheduleDownload}
                disabled={scheduleLoading}
                className="rounded bg-sky-600 px-4 py-2 text-base font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {scheduleLoading ? '…' : t('planner.download')}
              </button>
            </div>
            {scheduleGovernance && (
              <>
                <div className="flex flex-wrap gap-2">
                  {scheduleGovernance.weeks.some((w) => w.status === 'DRAFT') && (
                    <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800">
                      {t('governance.scheduleNotApproved') ?? 'This schedule is not approved'}
                    </span>
                  )}
                  {scheduleGovernance.weeks.some((w) => w.status === 'APPROVED' && w.lockStatus === 'LOCKED') && (
                    <span className="rounded bg-rose-100 px-2 py-1 text-sm font-medium text-rose-800">
                      {t('governance.approvedAndLocked') ?? 'Approved & Locked'}
                    </span>
                  )}
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="mb-2 font-semibold text-slate-800">{t('governance.exportHeader') ?? 'Export governance'}</p>
                  <p className="text-slate-700">
                    <span className="font-medium">{t('governance.exportedBy') ?? 'Exported by'}:</span> {scheduleGovernance.exportedBy}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-medium">{t('governance.exportTimestamp') ?? 'Export timestamp'}:</span>{' '}
                    {scheduleGovernance.exportTimestampLocal ?? new Date(scheduleGovernance.exportedAt).toLocaleString()}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {scheduleGovernance.weeks.map((w) => (
                      <li key={w.weekStart} className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600">
                        <span className="font-medium">{w.weekStart}</span>
                        <span>{t('governance.weekStatus') ?? 'Status'}: {w.status}</span>
                        <span>{t('governance.lockStatus') ?? 'Lock'}: {w.lockStatus ?? (w.lockedByName ? 'LOCKED' : 'UNLOCKED')}</span>
                        {w.lockedByName && (
                          <span>
                            {t('governance.lockedBy')} {w.lockedByName}{w.lockedByRole ? ` (${w.lockedByRole})` : ''}
                            {w.lockedAt ? ` ${t('common.on') ?? 'on'} ${new Date(w.lockedAt).toLocaleDateString()}` : ''}
                          </span>
                        )}
                        {w.approvedByName && (
                          <span>
                            {t('governance.approvedBy') ?? 'Approved by'} {w.approvedByName}{w.approvedByRole ? ` (${w.approvedByRole})` : ''}
                            {w.approvedAt ? ` ${t('common.on') ?? 'on'} ${new Date(w.approvedAt).toLocaleDateString()}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            {schedulePreview && schedulePreview.length > 0 && (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[500px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Title</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">AssignedTo</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Start / Due</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 text-slate-800">{row.Title}</td>
                        <td className="px-2 py-1.5 text-slate-600">{row.AssignedTo}</td>
                        <td className="px-2 py-1.5 text-slate-600">{row['Start Date']} / {row['Due Date']}</td>
                        <td className="px-2 py-1.5 text-slate-500">{row.Notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {schedulePreview.length > 50 && (
                  <p className="px-2 py-2 text-xs text-slate-500">Showing first 50 of {schedulePreview.length} rows.</p>
                )}
              </div>
            )}
          </div>
        </OpsCard>
      </div>
    </div>
  );
}
