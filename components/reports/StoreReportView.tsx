'use client';

import { useCallback, useState } from 'react';
import type { StoreReportPayload } from '@/lib/reports/storeReportService';
import { storeReportPeriodFromMeta, storeReportPeriodToQueryString } from '@/lib/reports/storeReportPeriod';
import { StoreDetailReport } from '@/components/reports/StoreDetailReport';
import { YtdPerformanceReport } from '@/components/reports/YtdPerformanceReport';
import { StoreReportPeriodControls } from '@/components/reports/StoreReportPeriodControls';

type Tab = 'detail' | 'ytd';

type Props = {
  data: StoreReportPayload;
  printMode?: boolean;
};

export function StoreReportView({ data, printMode = false }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('detail');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const periodQueryString = storeReportPeriodToQueryString(storeReportPeriodFromMeta(data.meta));

  const handleExportPdf = useCallback(async () => {
    const boutiqueId = data.meta.boutiqueId;
    const printUrl = `/reports/store/${boutiqueId}/print?${periodQueryString}`;

    window.open(printUrl, '_blank', 'noopener,noreferrer');

    setExportingPdf(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/reports/store/${boutiqueId}/pdf?${periodQueryString}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body.error as string) || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ??
        `store-report-${data.meta.boutiqueCode}-${data.meta.periodLabel.replace(/\s+/g, '-')}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  }, [data.meta.boutiqueCode, data.meta.boutiqueId, data.meta.periodLabel, periodQueryString]);

  const showDetail = printMode || activeTab === 'detail';
  const showYtd = printMode || activeTab === 'ytd';

  return (
    <div id="store-report-print" className="store-report-print mx-auto max-w-7xl">
      {!printMode && (
        <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F4C3A]">
                Executive Report
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                Store Performance Report
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {data.meta.boutiqueName} · {data.meta.periodLabel} · Generated {data.meta.generatedAt}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('detail')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    activeTab === 'detail'
                      ? 'bg-[#0F4C3A] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Store Detail
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ytd')}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    activeTab === 'ytd'
                      ? 'bg-[#0F4C3A] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {data.meta.periodKind === 'month' ? 'YTD Performance' : 'Period Summary'}
                </button>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={exportingPdf}
                  className="rounded-lg bg-[#0F4C3A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c3d2f] disabled:pointer-events-none disabled:opacity-60"
                >
                  {exportingPdf ? 'Exporting…' : 'Export PDF'}
                </button>
                {exportError ? (
                  <span className="text-xs text-red-600">{exportError}</span>
                ) : null}
              </div>
            </div>
          </div>

          <StoreReportPeriodControls boutiqueId={data.meta.boutiqueId} meta={data.meta} />
        </>
      )}

      {printMode && (
        <div className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F4C3A]">
            Team Monitor · Executive Store Performance Report
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {data.meta.boutiqueName} ({data.meta.boutiqueCode})
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.meta.periodLabel} · as of {data.meta.asOfDateKey}
          </p>
        </div>
      )}

      <div className="mt-8 space-y-16">
        {showDetail && <StoreDetailReport data={data.storeDetail} meta={data.meta} />}
        {showYtd && <YtdPerformanceReport data={data.ytdPerformance} meta={data.meta} />}
      </div>
    </div>
  );
}
