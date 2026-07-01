'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import type { StoreReportPayload } from '@/lib/reports/storeReportService';
import {
  formatStoreReportPeriodLabel,
  getStoreReportYearOptions,
  storeReportPeriodFromMeta,
  storeReportPeriodToQueryString,
  type StoreReportPeriodKind,
  type StoreReportPeriodQuery,
} from '@/lib/reports/storeReportPeriod';

type Props = {
  boutiqueId: string;
  meta: StoreReportPayload['meta'];
};

const PERIOD_KINDS: StoreReportPeriodKind[] = ['month', 'quarter', 'half', 'year'];

export function StoreReportPeriodControls({ boutiqueId, meta }: Props) {
  const router = useRouter();
  const { t, locale } = useT();

  const current = useMemo(() => storeReportPeriodFromMeta(meta), [meta]);
  const yearOptions = useMemo(() => getStoreReportYearOptions(), []);
  const periodLabel = useMemo(
    () => formatStoreReportPeriodLabel(current, locale === 'ar' ? 'ar' : 'en'),
    [current, locale]
  );

  const applyQuery = useCallback(
    (next: StoreReportPeriodQuery) => {
      const qs = storeReportPeriodToQueryString(next);
      router.push(`/reports/store/${boutiqueId}?${qs}`);
    },
    [boutiqueId, router]
  );

  const onKindChange = (kind: StoreReportPeriodKind) => {
    const base: StoreReportPeriodQuery = { kind, year: current.year };
    if (kind === 'month') {
      applyQuery({ ...base, month: current.month ?? meta.periodMonth ?? 1 });
    } else if (kind === 'quarter') {
      applyQuery({ ...base, quarter: current.quarter ?? meta.periodQuarter ?? 1 });
    } else if (kind === 'half') {
      applyQuery({ ...base, half: current.half ?? meta.periodHalf ?? 1 });
    } else {
      applyQuery(base);
    }
  };

  const selectClass =
    'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[#0F4C3A] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {t('storeReport.periodFilter')}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[140px] flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{t('storeReport.reportType')}</span>
          <select
            className={selectClass}
            value={meta.periodKind}
            onChange={(e) => onKindChange(e.target.value as StoreReportPeriodKind)}
          >
            {PERIOD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`storeReport.periodKind.${kind}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[100px] flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{t('storeReport.year')}</span>
          <select
            className={selectClass}
            value={meta.periodYear}
            onChange={(e) =>
              applyQuery({ ...current, year: Number(e.target.value) })
            }
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {meta.periodKind === 'month' && (
          <label className="flex min-w-[160px] flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{t('storeReport.month')}</span>
            <select
              className={selectClass}
              value={meta.periodMonth ?? 1}
              onChange={(e) =>
                applyQuery({ ...current, month: Number(e.target.value) })
              }
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {t(`storeReport.monthName.${m}`)}
                </option>
              ))}
            </select>
          </label>
        )}

        {meta.periodKind === 'quarter' && (
          <label className="flex min-w-[120px] flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{t('storeReport.quarter')}</span>
            <select
              className={selectClass}
              value={meta.periodQuarter ?? 1}
              onChange={(e) =>
                applyQuery({ ...current, quarter: Number(e.target.value) as 1 | 2 | 3 | 4 })
              }
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  {t(`storeReport.quarterName.${q}`)}
                </option>
              ))}
            </select>
          </label>
        )}

        {meta.periodKind === 'half' && (
          <label className="flex min-w-[160px] flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{t('storeReport.halfYear')}</span>
            <select
              className={selectClass}
              value={meta.periodHalf ?? 1}
              onChange={(e) =>
                applyQuery({ ...current, half: Number(e.target.value) as 1 | 2 })
              }
            >
              <option value={1}>{t('storeReport.halfName.1')}</option>
              <option value={2}>{t('storeReport.halfName.2')}</option>
            </select>
          </label>
        )}
      </div>
      <p className="text-sm text-slate-500">
        {t('storeReport.selectedPeriod')}: <span className="font-medium text-slate-800">{periodLabel}</span>
        {' · '}
        {meta.asOfDateKey}
      </p>
    </div>
  );
}
