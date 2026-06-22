'use client';

import { useCallback, useState } from 'react';
import type { StoreReportPayload } from '@/lib/reports/storeReportService';
import { StoreDetailReport } from '@/components/reports/StoreDetailReport';
import { YtdPerformanceReport } from '@/components/reports/YtdPerformanceReport';

type Tab = 'detail' | 'ytd';

type Props = {
  data: StoreReportPayload;
  printMode?: boolean;
};

export function StoreReportView({ data, printMode = false }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('detail');

  const handleExportPdf = useCallback(() => {
    const url = `/reports/store/${data.meta.boutiqueId}/print?month=${encodeURIComponent(data.meta.monthKey)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [data.meta.boutiqueId, data.meta.monthKey]);

  const showDetail = printMode || activeTab === 'detail';
  const showYtd = printMode || activeTab === 'ytd';

  return (
    <div id="store-report-print" className="store-report-print mx-auto max-w-7xl">
      {!printMode && (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F4C3A]">
              Executive Report
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              Store Performance Report
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.meta.boutiqueName} · Generated {data.meta.generatedAt}
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
                Store Detail (MTD)
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
                YTD Performance
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportPdf}
              className="rounded-lg bg-[#0F4C3A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c3d2f]"
            >
              Export PDF
            </button>
          </div>
        </div>
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
            {data.meta.monthKey} · as of {data.meta.asOfDateKey}
          </p>
        </div>
      )}

      <div className="space-y-16">
        {showDetail && <StoreDetailReport data={data.storeDetail} meta={data.meta} />}
        {showYtd && <YtdPerformanceReport data={data.ytdPerformance} meta={data.meta} />}
      </div>
    </div>
  );
}
