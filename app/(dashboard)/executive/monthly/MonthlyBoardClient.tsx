'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { addMonths, getCurrentMonthKeyRiyadh, parseMonthKey } from '@/lib/time';
import { useT } from '@/lib/i18n/useT';

type BoutiqueScore = {
  score: number;
  classification: string;
  components?: {
    revenue: number;
    tasks: number;
    schedule: number;
    zone: number;
    discipline: number;
  };
};

type MonthlyData = {
  monthKey: string;
  dataScope?: {
    boutiqueId: string;
    boutiqueName: string | null;
    boutiqueCode: string | null;
    monthKey: string;
    salesEntryCount: number;
    ledgerLineCount?: number;
  };
  boutiqueScore: BoutiqueScore;
  salesIntelligence: {
    revenue: number;
    target: number;
    achievementPct: number;
    totalEmployeeTarget: number;
    entryCount: number;
  };
  workforceStability: {
    pendingLeaves: number;
    approvedLeavesInPeriod: number;
    employeeTargetCount: number;
  };
  operationalDiscipline: {
    taskCompletionsInMonth: number;
    scheduleEditsInMonth: number;
    zoneRunsTotal: number;
    zoneCompliancePct: number;
  };
  riskScore: {
    score: number;
    classification: string;
  };
};

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm transition hover:shadow-md ${className}`}
    >
      <h2 className="mb-3 text-sm font-medium text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function isValidMonthKey(value: string): boolean {
  return parseMonthKey(value) !== null;
}

export function MonthlyBoardClient() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthFromUrl = searchParams.get('month') ?? '';
  const monthKey = isValidMonthKey(monthFromUrl)
    ? monthFromUrl
    : getCurrentMonthKeyRiyadh();

  const setMonthInUrl = useCallback(
    (newMonth: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('month', newMonth);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (!isValidMonthKey(monthFromUrl)) {
      setMonthInUrl(monthKey);
    }
  }, [monthFromUrl, monthKey, setMonthInUrl]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/executive/monthly?month=${encodeURIComponent(monthKey)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(setData)
      .catch(() => setError(t('executive.monthly.failedToLoad')))
      .finally(() => setLoading(false));
  }, [monthKey, t]);

  const goPrev = () => setMonthInUrl(addMonths(monthKey, -1));
  const goNext = () => setMonthInUrl(addMonths(monthKey, 1));
  const goThisMonth = () => setMonthInUrl(getCurrentMonthKeyRiyadh());

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-6 shadow-sm">
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-gray-500">{t('executive.monthly.loading')}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-800">
          {t('executive.monthly.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded border border-[#E8DFC8] bg-white">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-s border-e border-[#E8DFC8] px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              title={t('executive.monthly.previousMonth')}
              aria-label={t('executive.monthly.previousMonth')}
            >
              ◀ {t('executive.monthly.prev')}
            </button>
            <label className="sr-only" htmlFor="exec-month-picker">
              {t('executive.monthly.monthPickerLabel')}
            </label>
            <input
              id="exec-month-picker"
              type="month"
              value={monthKey}
              onChange={(e) => {
                const v = e.target.value;
                if (isValidMonthKey(v)) setMonthInUrl(v);
              }}
              className="border-0 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C6A756]"
            />
            <button
              type="button"
              onClick={goNext}
              className="rounded-e border-s border-[#E8DFC8] px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              title={t('executive.monthly.nextMonth')}
              aria-label={t('executive.monthly.nextMonth')}
            >
              {t('executive.monthly.next')} ▶
            </button>
          </div>
          <button
            type="button"
            onClick={goThisMonth}
            className="rounded border border-[#E8DFC8] bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t('executive.monthly.thisMonth')}
          </button>
        </div>
      </div>

      {data.dataScope && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <strong>{t('executive.monthly.dataScope')}:</strong>{' '}
          {t('executive.monthly.boutiqueLabel')}: {data.dataScope.boutiqueName ?? data.dataScope.boutiqueId}
          {data.dataScope.boutiqueCode != null && ` (${data.dataScope.boutiqueCode})`}
          {' · '}
          {t('executive.monthly.monthLabel')}: {data.dataScope.monthKey}
          {' · '}
          {t('executive.monthly.salesEntries')}: {data.dataScope.salesEntryCount}
          {' · '}
          {t('executive.monthly.ledgerLines')}: {data.dataScope.ledgerLineCount ?? '—'}
        </div>
      )}

      {/* Boutique Performance Score */}
      <div className="rounded-2xl border-2 border-[#E8DFC8] bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-gray-500">
          {t('executive.monthly.boutiquePerformanceScore')}
        </h2>
        <p className="text-3xl font-semibold text-[#C6A756]">
          {data.boutiqueScore.score}
          <span className="ms-2 text-lg font-normal text-gray-600">
            ({data.boutiqueScore.classification})
          </span>
        </p>
        {data.boutiqueScore.components && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>{t('executive.monthly.sales')}: {data.boutiqueScore.components.revenue}</span>
            <span>{t('executive.monthly.tasks')}: {data.boutiqueScore.components.tasks}</span>
            <span>{t('executive.monthly.schedule')}: {data.boutiqueScore.components.schedule}</span>
            <span>{t('executive.monthly.zone')}: {data.boutiqueScore.components.zone}</span>
            <span>{t('executive.monthly.discipline')}: {data.boutiqueScore.components.discipline}</span>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('executive.monthly.salesIntelligence')}>
          <ul className="space-y-1 text-sm">
            <li>{t('executive.monthly.salesSar')}: <strong>{data.salesIntelligence.revenue.toLocaleString()}</strong></li>
            <li>{t('executive.monthly.target')}: <strong>{data.salesIntelligence.target.toLocaleString()}</strong></li>
            <li>{t('executive.monthly.achievement')}: <strong className="text-[#C6A756]">{data.salesIntelligence.achievementPct}%</strong></li>
            <li>{t('executive.monthly.employeeTargets')}: {data.salesIntelligence.totalEmployeeTarget}</li>
            <li>{t('executive.monthly.salesEntriesCount')}: {data.salesIntelligence.entryCount}</li>
          </ul>
        </Card>

        <Card title={t('executive.monthly.workforceStability')}>
          <ul className="space-y-1 text-sm">
            <li>{t('executive.monthly.pendingLeaves')}: <strong>{data.workforceStability.pendingLeaves}</strong></li>
            <li>{t('executive.monthly.approvedLeavesInPeriod')}: {data.workforceStability.approvedLeavesInPeriod}</li>
            <li>{t('executive.monthly.employeesWithTarget')}: {data.workforceStability.employeeTargetCount}</li>
          </ul>
        </Card>

        <Card title={t('executive.monthly.operationalDiscipline')}>
          <ul className="space-y-1 text-sm">
            <li>{t('executive.monthly.taskCompletions')}: <strong>{data.operationalDiscipline.taskCompletionsInMonth}</strong></li>
            <li>{t('executive.monthly.scheduleEdits')}: {data.operationalDiscipline.scheduleEditsInMonth}</li>
            <li>{t('executive.monthly.zoneRuns')}: {data.operationalDiscipline.zoneRunsTotal}</li>
            <li>{t('executive.monthly.zoneCompliance')}: <strong className="text-[#C6A756]">{data.operationalDiscipline.zoneCompliancePct}%</strong></li>
          </ul>
        </Card>

        <Card title={t('executive.monthly.riskScore')}>
          <p className="text-2xl font-semibold text-[#C6A756]">
            {data.riskScore.score}
          </p>
          <p className="text-sm text-gray-600">{data.riskScore.classification}</p>
        </Card>
      </div>
    </div>
  );
}
