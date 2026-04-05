'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/useT';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { formatSarInt } from '@/lib/utils/money';
import { PageContainer, SectionBlock } from '@/components/ui/ExecutiveIntelligence';
import { Button } from '@/components/ui/Button';
import {
  averageBasketSize,
  basicForecastEndOfMonth,
  conversionRate,
  dailyAchievementPct,
  monthContextFromDateKey,
  mtdAchievementPct,
  remainingToTarget,
  requiredDailyPace,
} from '@/lib/test-sales/calculations';
import type { SalesTestEntryPayload } from '@/components/test-sales/SalesTestDashboardClient';

type BoutiqueOpt = { id: string; code: string; name: string };

type LineId = { _id: string; name?: string; branchLabel?: string; salesSar: string; targetSar: string };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SalesTestInputClient() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const initialDate = searchParams.get('dateKey')?.trim() || getRiyadhDateKey();

  const [boutiques, setBoutiques] = useState<BoutiqueOpt[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [dateKey, setDateKey] = useState(() => initialDate);
  const [boutiqueId, setBoutiqueId] = useState('');
  const [boutiqueLabel, setBoutiqueLabel] = useState('');
  const [todaySalesSar, setTodaySalesSar] = useState('0');
  const [dailyTargetSar, setDailyTargetSar] = useState('0');
  const [mtdSalesSar, setMtdSalesSar] = useState('0');
  const [mtdTargetSar, setMtdTargetSar] = useState('0');
  const [visitors, setVisitors] = useState('');
  const [transactions, setTransactions] = useState('');
  const [stockAvailabilityPct, setStockAvailabilityPct] = useState('');
  const [campaignActive, setCampaignActive] = useState(false);
  const [campaignNotes, setCampaignNotes] = useState('');
  const [yesterdaySalesSar, setYesterdaySalesSar] = useState('');
  const [sameDayLastWeekSalesSar, setSameDayLastWeekSalesSar] = useState('');
  const [lastMonthMtdSalesSar, setLastMonthMtdSalesSar] = useState('');
  const [timePatternNote, setTimePatternNote] = useState('');
  const [promotionImpactNote, setPromotionImpactNote] = useState('');
  const [monthTrendJson, setMonthTrendJson] = useState('[]');
  const [employees, setEmployees] = useState<LineId[]>([]);
  const [branches, setBranches] = useState<LineId[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadOk, setLoadOk] = useState(false);

  const applyEntry = useCallback((e: SalesTestEntryPayload | null) => {
    if (!e) {
      setTodaySalesSar('0');
      setDailyTargetSar('0');
      setMtdSalesSar('0');
      setMtdTargetSar('0');
      setBoutiqueId('');
      setBoutiqueLabel('');
      setVisitors('');
      setTransactions('');
      setStockAvailabilityPct('');
      setCampaignActive(false);
      setCampaignNotes('');
      setYesterdaySalesSar('');
      setSameDayLastWeekSalesSar('');
      setLastMonthMtdSalesSar('');
      setTimePatternNote('');
      setPromotionImpactNote('');
      setMonthTrendJson('[]');
      setEmployees([]);
      setBranches([]);
      return;
    }
    setDateKey(e.dateKey);
    setBoutiqueId(e.boutiqueId ?? '');
    setBoutiqueLabel(e.boutiqueLabel ?? '');
    setTodaySalesSar(String(e.todaySalesSar));
    setDailyTargetSar(String(e.dailyTargetSar));
    setMtdSalesSar(String(e.mtdSalesSar));
    setMtdTargetSar(String(e.mtdTargetSar));
    setVisitors(e.visitors != null ? String(e.visitors) : '');
    setTransactions(e.transactions != null ? String(e.transactions) : '');
    setStockAvailabilityPct(e.stockAvailabilityPct != null ? String(e.stockAvailabilityPct) : '');
    setCampaignActive(e.campaignActive);
    setCampaignNotes(e.campaignNotes ?? '');
    setYesterdaySalesSar(e.yesterdaySalesSar != null ? String(e.yesterdaySalesSar) : '');
    setSameDayLastWeekSalesSar(e.sameDayLastWeekSalesSar != null ? String(e.sameDayLastWeekSalesSar) : '');
    setLastMonthMtdSalesSar(e.lastMonthMtdSalesSar != null ? String(e.lastMonthMtdSalesSar) : '');
    setTimePatternNote(e.timePatternNote ?? '');
    setPromotionImpactNote(e.promotionImpactNote ?? '');
    setMonthTrendJson(e.monthTrendJson && e.monthTrendJson.trim() ? e.monthTrendJson : '[]');
    setEmployees(
      e.employees.map((x) => ({
        _id: newId(),
        name: x.name,
        salesSar: String(x.salesSar),
        targetSar: String(x.targetSar),
      }))
    );
    setBranches(
      e.branches.map((x) => ({
        _id: newId(),
        branchLabel: x.branchLabel,
        salesSar: String(x.salesSar),
        targetSar: String(x.targetSar),
      }))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const [optRes, entryRes] = await Promise.all([
          fetch('/api/test-sales/options'),
          fetch(`/api/test-sales/entry?dateKey=${encodeURIComponent(dateKey)}`),
        ]);
        const optJson = await optRes.json().catch(() => ({}));
        const entryJson = await entryRes.json().catch(() => ({}));
        if (cancelled) return;
        if (optRes.ok && Array.isArray((optJson as { boutiques?: BoutiqueOpt[] }).boutiques)) {
          setBoutiques((optJson as { boutiques: BoutiqueOpt[] }).boutiques);
        }
        if (entryRes.ok) {
          applyEntry((entryJson as { entry: SalesTestEntryPayload | null }).entry ?? null);
        }
        setLoadOk(true);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, applyEntry]);

  const intVal = (s: string) => {
    const n = parseInt(s.replace(/,/g, '').trim(), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const preview = useMemo(() => {
    const today = intVal(todaySalesSar);
    const dailyT = intVal(dailyTargetSar);
    const mtdS = intVal(mtdSalesSar);
    const mtdT = intVal(mtdTargetSar);
    const ctx = monthContextFromDateKey(dateKey);
    const dailyAch = dailyAchievementPct(today, dailyT);
    const mtdAch = mtdAchievementPct(mtdS, mtdT);
    const rem = remainingToTarget(mtdS, mtdT);
    const pace =
      ctx != null ? requiredDailyPace(mtdS, mtdT, ctx.remainingDaysIncludingToday) : null;
    const forecast =
      ctx != null ? basicForecastEndOfMonth(mtdS, ctx.elapsedDays, ctx.totalDaysInMonth) : null;
    const v = visitors.trim() === '' ? null : intVal(visitors);
    const tx = transactions.trim() === '' ? null : intVal(transactions);
    return {
      dailyAch,
      mtdAch,
      rem,
      pace,
      forecast,
      basket: averageBasketSize(today, tx),
      conv: conversionRate(tx, v),
    };
  }, [todaySalesSar, dailyTargetSar, mtdSalesSar, mtdTargetSar, dateKey, visitors, transactions]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const trendPayload: string | null = monthTrendJson.trim() || '[]';
      try {
        JSON.parse(trendPayload);
      } catch {
        setMessage(t('testSales.formMonthTrend') + ': invalid JSON');
        setSaving(false);
        return;
      }
      const body = {
        dateKey,
        boutiqueId: boutiqueId || null,
        boutiqueLabel: boutiqueLabel.trim() || null,
        todaySalesSar: intVal(todaySalesSar),
        dailyTargetSar: intVal(dailyTargetSar),
        mtdSalesSar: intVal(mtdSalesSar),
        mtdTargetSar: intVal(mtdTargetSar),
        visitors: visitors.trim() === '' ? null : intVal(visitors),
        transactions: transactions.trim() === '' ? null : intVal(transactions),
        stockAvailabilityPct: stockAvailabilityPct.trim() === '' ? null : intVal(stockAvailabilityPct),
        campaignActive,
        campaignNotes: campaignNotes.trim() || null,
        yesterdaySalesSar: yesterdaySalesSar.trim() === '' ? null : intVal(yesterdaySalesSar),
        sameDayLastWeekSalesSar: sameDayLastWeekSalesSar.trim() === '' ? null : intVal(sameDayLastWeekSalesSar),
        lastMonthMtdSalesSar: lastMonthMtdSalesSar.trim() === '' ? null : intVal(lastMonthMtdSalesSar),
        timePatternNote: timePatternNote.trim() || null,
        promotionImpactNote: promotionImpactNote.trim() || null,
        monthTrendJson: trendPayload,
        employees: employees
          .filter((r) => (r.name ?? '').trim())
          .map((r) => ({
            name: r.name!.trim(),
            salesSar: intVal(r.salesSar),
            targetSar: intVal(r.targetSar),
          })),
        branches: branches
          .filter((r) => (r.branchLabel ?? '').trim())
          .map((r) => ({
            branchLabel: r.branchLabel!.trim(),
            salesSar: intVal(r.salesSar),
            targetSar: intVal(r.targetSar),
          })),
      };
      const res = await fetch('/api/test-sales/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage((json as { error?: string }).error ?? t('testSales.saveError'));
        return;
      }
      applyEntry((json as { entry: SalesTestEntryPayload }).entry);
      setMessage(t('testSales.saveSuccess'));
    } catch {
      setMessage(t('testSales.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingMeta && !loadOk) {
    return (
      <PageContainer>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </PageContainer>
    );
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm';

  return (
    <PageContainer>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
        <div>
          <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            {t('testSales.badge')}
          </span>
          <h1 className="mt-2 text-xl font-semibold text-foreground md:text-2xl">{t('testSales.inputTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('testSales.inputSubtitle')}</p>
        </div>
        <Link href={`/test/sales-dashboard?dateKey=${encodeURIComponent(dateKey)}`}>
          <Button type="button" variant="secondary" className="h-9 text-sm">
            {t('testSales.openDashboard')}
          </Button>
        </Link>
      </div>

      {message ? (
        <p className="mb-4 text-sm font-medium text-foreground" role="status">
          {message}
        </p>
      ) : null}

      <SectionBlock title={t('testSales.formBasics')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.dateLabel')}</label>
            <input
              type="date"
              className={inputClass}
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.boutiqueLabel')}</label>
            <select
              className={inputClass}
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
            >
              <option value="">—</option>
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-muted">{t('testSales.boutiqueOptionalLabel')}</label>
            <input
              className={inputClass}
              value={boutiqueLabel}
              onChange={(e) => setBoutiqueLabel(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.sales')} (today)</label>
            <input className={inputClass} inputMode="numeric" value={todaySalesSar} onChange={(e) => setTodaySalesSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.target')} (daily)</label>
            <input className={inputClass} inputMode="numeric" value={dailyTargetSar} onChange={(e) => setDailyTargetSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.sales')} (MTD)</label>
            <input className={inputClass} inputMode="numeric" value={mtdSalesSar} onChange={(e) => setMtdSalesSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.target')} (MTD)</label>
            <input className={inputClass} inputMode="numeric" value={mtdTargetSar} onChange={(e) => setMtdTargetSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.footfall')}</label>
            <input className={inputClass} inputMode="numeric" value={visitors} onChange={(e) => setVisitors(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.transactions')}</label>
            <input className={inputClass} inputMode="numeric" value={transactions} onChange={(e) => setTransactions(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.stockAvail')}</label>
            <input className={inputClass} inputMode="numeric" value={stockAvailabilityPct} onChange={(e) => setStockAvailabilityPct(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="camp"
              type="checkbox"
              checked={campaignActive}
              onChange={(e) => setCampaignActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="camp" className="text-sm font-medium text-foreground">
              {t('testSales.campaign')}
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-muted">{t('testSales.campaignNotes')}</label>
            <textarea className={`${inputClass} min-h-[72px]`} value={campaignNotes} onChange={(e) => setCampaignNotes(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-muted">{t('testSales.timePattern')}</label>
            <textarea className={`${inputClass} min-h-[56px]`} value={timePatternNote} onChange={(e) => setTimePatternNote(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-muted">{t('testSales.promotionImpact')}</label>
            <textarea className={`${inputClass} min-h-[56px]`} value={promotionImpactNote} onChange={(e) => setPromotionImpactNote(e.target.value)} />
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title={t('testSales.formComparisons')}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.compareTodayVsYesterday')}</label>
            <input className={inputClass} inputMode="numeric" value={yesterdaySalesSar} onChange={(e) => setYesterdaySalesSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.compareTodayVsWeekAgo')}</label>
            <input className={inputClass} inputMode="numeric" value={sameDayLastWeekSalesSar} onChange={(e) => setSameDayLastWeekSalesSar(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted">{t('testSales.compareMtdVsLastMonth')}</label>
            <input className={inputClass} inputMode="numeric" value={lastMonthMtdSalesSar} onChange={(e) => setLastMonthMtdSalesSar(e.target.value)} />
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title={t('testSales.previewTitle')}>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            <span className="text-muted">{t('testSales.dailyAch')}: </span>
            <span className="font-medium tabular-nums">{preview.dailyAch != null ? `${preview.dailyAch}%` : '—'}</span>
          </p>
          <p>
            <span className="text-muted">{t('testSales.mtdAch')}: </span>
            <span className="font-medium tabular-nums">{preview.mtdAch != null ? `${preview.mtdAch}%` : '—'}</span>
          </p>
          <p>
            <span className="text-muted">{t('testSales.remaining')}: </span>
            <span className="font-medium tabular-nums">{formatSarInt(Math.max(0, preview.rem))}</span>
          </p>
          <p>
            <span className="text-muted">{t('testSales.reqPace')}: </span>
            <span className="font-medium tabular-nums">{preview.pace != null ? formatSarInt(preview.pace) : '—'}</span>
          </p>
          <p>
            <span className="text-muted">{t('testSales.basket')}: </span>
            <span className="font-medium tabular-nums">{preview.basket != null ? formatSarInt(preview.basket) : '—'}</span>
          </p>
          <p>
            <span className="text-muted">{t('testSales.conversionLbl')}: </span>
            <span className="font-medium tabular-nums">{preview.conv != null ? `${preview.conv}%` : '—'}</span>
          </p>
          <p className="md:col-span-2">
            <span className="text-muted">{t('testSales.forecastEom')}: </span>
            <span className="font-medium tabular-nums">{preview.forecast != null ? formatSarInt(preview.forecast) : '—'}</span>
          </p>
        </div>
      </SectionBlock>

      <SectionBlock title={t('testSales.formLines')}>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{t('testSales.branchesTitle')}</h3>
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setBranches((s) => [...s, { _id: newId(), branchLabel: '', salesSar: '0', targetSar: '0' }])}
              >
                {t('testSales.addBranchRow')}
              </Button>
            </div>
            <ul className="space-y-2">
              {branches.map((r) => (
                <li key={r._id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border/80 bg-surface-subtle/50 p-3">
                  <input
                    className={`${inputClass} flex-1 min-w-[120px]`}
                    placeholder={t('common.name')}
                    value={r.branchLabel ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBranches((rows) => rows.map((x) => (x._id === r._id ? { ...x, branchLabel: v } : x)));
                    }}
                  />
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="numeric"
                    value={r.salesSar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBranches((rows) => rows.map((x) => (x._id === r._id ? { ...x, salesSar: v } : x)));
                    }}
                  />
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="numeric"
                    value={r.targetSar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBranches((rows) => rows.map((x) => (x._id === r._id ? { ...x, targetSar: v } : x)));
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 text-xs"
                    onClick={() => setBranches((rows) => rows.filter((x) => x._id !== r._id))}
                  >
                    {t('testSales.removeRow')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{t('testSales.employeesTitle')}</h3>
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setEmployees((s) => [...s, { _id: newId(), name: '', salesSar: '0', targetSar: '0' }])}
              >
                {t('testSales.addEmployeeRow')}
              </Button>
            </div>
            <ul className="space-y-2">
              {employees.map((r) => (
                <li key={r._id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border/80 bg-surface-subtle/50 p-3">
                  <input
                    className={`${inputClass} flex-1 min-w-[120px]`}
                    placeholder={t('common.name')}
                    value={r.name ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEmployees((rows) => rows.map((x) => (x._id === r._id ? { ...x, name: v } : x)));
                    }}
                  />
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="numeric"
                    value={r.salesSar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEmployees((rows) => rows.map((x) => (x._id === r._id ? { ...x, salesSar: v } : x)));
                    }}
                  />
                  <input
                    className={`${inputClass} w-28`}
                    inputMode="numeric"
                    value={r.targetSar}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEmployees((rows) => rows.map((x) => (x._id === r._id ? { ...x, targetSar: v } : x)));
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 text-xs"
                    onClick={() => setEmployees((rows) => rows.filter((x) => x._id !== r._id))}
                  >
                    {t('testSales.removeRow')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title={t('testSales.formMonthTrend')}>
        <p className="mb-2 text-xs text-muted">{t('testSales.formMonthTrendHint')}</p>
        <textarea className={`${inputClass} min-h-[120px] font-mono text-xs`} value={monthTrendJson} onChange={(e) => setMonthTrendJson(e.target.value)} />
      </SectionBlock>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={saving} onClick={handleSave}>
          {saving ? t('testSales.saving') : t('common.save')}
        </Button>
        <Link href={`/test/sales-dashboard?dateKey=${encodeURIComponent(dateKey)}`}>
          <Button type="button" variant="secondary" disabled={saving}>
            {t('testSales.openDashboard')}
          </Button>
        </Link>
      </div>
    </PageContainer>
  );
}
