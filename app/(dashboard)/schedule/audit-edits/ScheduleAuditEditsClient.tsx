'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { LuxuryTable, LuxuryTableHead, LuxuryTh, LuxuryTableBody, LuxuryTd } from '@/components/ui/LuxuryTable';

type AuditEditRow = {
  id: string;
  weekStart: string;
  editorId: string;
  editorName: string;
  editedAt: string;
  changesJson: unknown;
  changedCells: number;
};

export function ScheduleAuditEditsClient() {
  const { t } = useT();
  const [list, setList] = useState<AuditEditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (weekStart) params.set('weekStart', weekStart);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    fetch(`/api/schedule/audit-edits?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data?.list) ? data.list : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [weekStart, from, to]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const detail = detailId ? list.find((r) => r.id === detailId) : null;

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold text-foreground">{t('schedule.auditEditsTitle')}</h1>

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t('schedule.weekStart')}</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="rounded border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={fetchList}
          className="rounded border border-border bg-surface-subtle px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-subtle"
        >
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <LuxuryTable>
            <LuxuryTableHead>
              <LuxuryTh>{t('schedule.editedAt')}</LuxuryTh>
              <LuxuryTh>{t('schedule.editedBy')}</LuxuryTh>
              <LuxuryTh>{t('schedule.weekStart')}</LuxuryTh>
              <LuxuryTh>{t('schedule.changedCells')}</LuxuryTh>
              <LuxuryTh>{t('schedule.viewDetails')}</LuxuryTh>
            </LuxuryTableHead>
            <LuxuryTableBody>
              {list.length === 0 ? (
                <tr>
                  <LuxuryTd colSpan={5} className="text-center text-muted py-4">
                    {t('tasks.emptyList')}
                  </LuxuryTd>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <LuxuryTd className="text-sm text-foreground">
                      {new Date(r.editedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </LuxuryTd>
                    <LuxuryTd>{r.editorName}</LuxuryTd>
                    <LuxuryTd>{r.weekStart}</LuxuryTd>
                    <LuxuryTd>{r.changedCells}</LuxuryTd>
                    <LuxuryTd>
                      <button
                        type="button"
                        onClick={() => setDetailId(detailId === r.id ? null : r.id)}
                        className="text-accent hover:underline text-sm"
                      >
                        {t('schedule.viewDetails')}
                      </button>
                    </LuxuryTd>
                  </tr>
                ))
              )}
            </LuxuryTableBody>
          </LuxuryTable>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">{t('schedule.changes')}</h2>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="rounded border border-border px-2 py-1 text-sm"
              >
                {t('common.close')}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words text-xs bg-surface-subtle p-3 rounded border border-border overflow-x-auto">
              {JSON.stringify(detail.changesJson, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
