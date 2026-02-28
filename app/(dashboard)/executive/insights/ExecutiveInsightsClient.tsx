'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '@/app/providers';
import { ExecutiveLineChart } from '@/components/executive/ExecutiveLineChart';

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

type Risk = { score: number; level: string; reasons: string[] };
type Narrative = { whatChanged: string[]; why: string[]; nextActions: string[] };
type SalesMomentum = {
  weekOverWeekGrowthPct: number;
  movingAverage4Weeks: number;
  volatilityIndex: number;
  bestPerformingDay: { dateStr: string; amount: number } | null;
  weakestPerformingDay: { dateStr: string; amount: number } | null;
};
type InsightsData = {
  weekStart: string;
  weekEnd: string;
  kpis: {
    revenue: number;
    target: number;
    achievementPct: number;
    overduePct: number;
    zoneCompliancePct: number;
    scheduleBalancePct: number;
    taskCompleted: number;
    taskTotal: number;
  };
  risk: Risk;
  salesRisk?: { score: number; level: string; reasons: string[] };
  revenueTrendDirection?: string;
  targetGapMomentum?: string;
  salesMomentum?: SalesMomentum;
  projectionNext2Weeks?: { weekOffset: number; projectedRevenue: number }[];
  topPerformers: { userId: string; name: string; count: number }[];
  zoneByCode: { zone: string; rate: number }[];
  narrative: Narrative;
};

type TrendPoint = {
  weekStart: string;
  revenue: number;
  target: number;
  achievementPct: number;
  overduePct: number;
  zoneCompliancePct: number;
};

type AlertItem = {
  id: string;
  severity: string;
  titleKey: string;
  evidenceKey: string;
  evidence: Record<string, string | number>;
  deepLink?: string;
  weekStart: string;
};

type AnomalyItem = {
  kind: string;
  severity: string;
  titleKey: string;
  evidenceKey: string;
  evidence: Record<string, string | number>;
  deepLink?: string;
  weekStart?: string;
};

type EmployeeIntelligenceRow = {
  userId: string;
  name: string;
  revenueWTD: number;
  revenueMTD: number;
  employeeMonthlyTarget: number;
  achievementPercent: number;
  trend: 'uptrend' | 'flat' | 'downtrend';
  consistency: number;
  ersScore: number;
  ersLabel: string;
  reasons: string[];
};

function levelColor(level: string): string {
  if (level === 'HIGH' || level === 'Critical' || level === 'At Risk') return 'text-amber-700';
  if (level === 'MED' || level === 'Watch') return 'text-amber-600';
  if (level === 'Strong' || level === 'Dominant') return 'text-emerald-600';
  return 'text-slate-700';
}

function severityColor(s: string): string {
  if (s === 'high') return 'border-l-amber-500 bg-amber-50/50';
  if (s === 'medium') return 'border-l-amber-400 bg-amber-50/40';
  return 'border-l-slate-400 bg-slate-50/50';
}

function getSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day - 6 + 7) % 7;
  const sat = new Date(d);
  sat.setUTCDate(sat.getUTCDate() - diff);
  return sat.toISOString().slice(0, 10);
}

export function ExecutiveInsightsClient() {
  const { messages } = useI18n();
  const t = (key: string) => (getNested(messages, key) as string) || key;

  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [employeeIntelligence, setEmployeeIntelligence] = useState<EmployeeIntelligenceRow[]>([]);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() =>
    getSaturday(new Date().toISOString().slice(0, 10))
  );

  const toggleReasons = useCallback((userId: string) => {
    setExpandedEmployeeId((prev) => (prev === userId ? null : userId));
  }, []);

  useEffect(() => {
    if (!weekStart) return;
    setLoading(true);
    setError(null);
    const q = `weekStart=${encodeURIComponent(weekStart)}`;
    Promise.all([
      fetch(`/api/executive/insights?${q}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Insights')))),
      fetch('/api/executive/trends?n=4').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Trends')))),
      fetch(`/api/executive/alerts?${q}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Alerts')))),
      fetch('/api/executive/anomalies?n=4').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Anomalies')))),
      fetch(`/api/executive/employee-intelligence?${q}`).then((r) =>
        r.ok ? r.json() : Promise.resolve({ employees: [] as EmployeeIntelligenceRow[] })
      ),
    ])
      .then(([ins, tr, al, an, emp]) => {
        setInsights(ins);
        setTrends(tr.trends ?? []);
        setAlerts(al.alerts ?? []);
        setAnomalies(an.anomalies ?? []);
        setEmployeeIntelligence(emp.employees ?? []);
      })
      .catch(() => setError('failed'))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const levelLabel = (level: string) => t(`executive.level.${level.replace(/\s+/g, '')}`) || level;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#E8DFC8] bg-white p-6 shadow-sm">
          <p className="text-slate-600">{t('executive.insights.failedToLoad')}</p>
        </div>
      </div>
    );
  }

  if (loading && !insights) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-gray-500">{t('executive.insights.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-800">{t('executive.insights.pageTitle')}</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">{t('executive.insights.week')}</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(getSaturday(e.target.value))}
            className="rounded border border-[#E8DFC8] bg-white px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {insights && (
        <>
          {/* Top KPI row */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.salesSar')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.revenue.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.target')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.target.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.achievementPct')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.achievementPct}%</p>
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.overduePct')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.overduePct}%</p>
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.zoneCompliancePct')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.zoneCompliancePct}%</p>
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{t('executive.insights.scheduleBalancePct')}</p>
              <p className="text-2xl font-semibold text-gray-800">{insights.kpis.scheduleBalancePct}%</p>
            </div>
          </section>

          {/* Risk card */}
          <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-medium text-gray-500">{t('executive.insights.riskIndex')}</h2>
            <p className={`text-2xl font-semibold ${levelColor(insights.risk.level)}`}>
              {insights.risk.score} — {levelLabel(insights.risk.level)}
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
              {insights.risk.reasons.map((r, i) => (
                <li key={i}>{t(r)}</li>
              ))}
            </ul>
          </div>

          {/* Sales Risk (revenue-centric) */}
          {insights.salesRisk != null && (
            <div className="rounded-2xl border-2 border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium text-gray-500">{t('executive.salesRisk.title')}</h2>
              <p className={`text-2xl font-semibold ${levelColor(insights.salesRisk.level)}`}>
                {insights.salesRisk.score} — {levelLabel(insights.salesRisk.level)}
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                {insights.salesRisk.reasons.map((r, i) => (
                  <li key={i}>{t(r)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sales Momentum */}
          {insights.salesMomentum != null && (
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.salesMomentum.title')}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs text-gray-500">{t('executive.salesMomentum.weekOverWeek')}</p>
                  <p className="text-xl font-semibold text-gray-800">{insights.salesMomentum.weekOverWeekGrowthPct}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('executive.salesMomentum.movingAverage4')}</p>
                  <p className="text-xl font-semibold text-gray-800">{insights.salesMomentum.movingAverage4Weeks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('executive.salesMomentum.volatilityIndex')}</p>
                  <p className="text-xl font-semibold text-gray-800">{insights.salesMomentum.volatilityIndex}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('executive.salesMomentum.bestDay')}</p>
                  <p className="text-lg font-semibold text-gray-800">
                    {insights.salesMomentum.bestPerformingDay
                      ? `${insights.salesMomentum.bestPerformingDay.dateStr} (${insights.salesMomentum.bestPerformingDay.amount.toLocaleString()})`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('executive.salesMomentum.weakestDay')}</p>
                  <p className="text-lg font-semibold text-gray-800">
                    {insights.salesMomentum.weakestPerformingDay
                      ? `${insights.salesMomentum.weakestPerformingDay.dateStr} (${insights.salesMomentum.weakestPerformingDay.amount.toLocaleString()})`
                      : '—'}
                  </p>
                </div>
              </div>
              {insights.revenueTrendDirection != null && (
                <p className="mt-2 text-sm text-gray-600">
                  {t('executive.salesMomentum.trendLabel')}: {t(`executive.salesMomentum.trend.${insights.revenueTrendDirection}`)}
                </p>
              )}
              {insights.targetGapMomentum != null && (
                <p className="text-sm text-gray-600">
                  {t('executive.salesMomentum.gapLabel')}: {t(`executive.salesMomentum.gap.${insights.targetGapMomentum}`)}
                </p>
              )}
            </div>
          )}

          {/* 2-week projection */}
          {insights.projectionNext2Weeks != null && insights.projectionNext2Weeks.length > 0 && (
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium text-gray-500">{t('executive.salesMomentum.projectionTitle')}</h2>
              <ul className="text-sm text-gray-700">
                {insights.projectionNext2Weeks.map((p) => (
                  <li key={p.weekOffset}>
                    {t('executive.salesMomentum.projectionWeek')} {p.weekOffset}: {p.projectedRevenue.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Employee Intelligence */}
          <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm overflow-x-auto">
            <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.employeeIntelligence.title')}</h2>
            {employeeIntelligence.length === 0 ? (
              <p className="text-sm text-gray-500">No employee targets for this week’s month.</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E8DFC8] text-left text-gray-600">
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.name')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.revenueMTD')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.target')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.achPct')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.trend')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.consistency')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.ers')}</th>
                    <th className="py-2 pr-2 font-medium">{t('executive.employeeIntelligence.label')}</th>
                    <th className="py-2 font-medium">{t('executive.employeeIntelligence.reasons')}</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeIntelligence.map((row, index) => {
                    const isTop3 = index < 3;
                    const isBottom2 = index >= Math.max(0, employeeIntelligence.length - 2) && employeeIntelligence.length > 3;
                    const rowBg = isTop3 ? 'bg-emerald-50/70' : isBottom2 ? 'bg-amber-50/70' : '';
                    const expanded = expandedEmployeeId === row.userId;
                    return (
                      <tr
                        key={row.userId}
                        className={`border-b border-[#E8DFC8] ${rowBg}`}
                      >
                        <td className="py-2 pr-2 font-medium text-gray-800">{row.name}</td>
                        <td className="py-2 pr-2 text-gray-700">{row.revenueMTD.toLocaleString()}</td>
                        <td className="py-2 pr-2 text-gray-700">{row.employeeMonthlyTarget.toLocaleString()}</td>
                        <td className={`py-2 pr-2 tabular-nums ${row.achievementPercent < 20 ? 'text-amber-700' : 'text-slate-900'}`}>{row.achievementPercent}%</td>
                        <td className="py-2 pr-2 text-gray-700">{t(`executive.salesMomentum.trend.${row.trend}`)}</td>
                        <td className="py-2 pr-2 text-gray-700">{row.consistency}</td>
                        <td className="py-2 pr-2 font-medium text-gray-800">{row.ersScore}</td>
                        <td className={`py-2 pr-2 font-medium ${levelColor(row.ersLabel)}`}>{levelLabel(row.ersLabel)}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => toggleReasons(row.userId)}
                            className="text-[#C6A756] hover:underline text-left"
                          >
                            {expanded ? '▼' : '▶'} {expanded ? t('executive.insights.hide') : t('executive.insights.show')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {employeeIntelligence.length > 0 && (
              <div className="mt-3 border-t border-[#E8DFC8] pt-2">
                {employeeIntelligence.map((row) =>
                  expandedEmployeeId === row.userId ? (
                    <div key={row.userId} className="mb-2 rounded bg-gray-50 p-2 text-sm">
                      <p className="font-medium text-gray-700 mb-1">{row.name} — {t('executive.employeeIntelligence.reasons')}</p>
                      <ul className="list-inside list-disc text-gray-600">
                        {row.reasons.map((r, i) => (
                          <li key={i}>{t(r)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.alerts')}</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-500">{t('executive.insights.noAlerts')}</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => {
                  const parts: string[] = [];
                  if (typeof a.evidence.reasons === 'string') {
                    const translated = (a.evidence.reasons as string)
                      .split(',')
                      .map((k) => t(k.trim()))
                      .filter(Boolean);
                    if (translated.length) parts.push(translated.join(' · '));
                  }
                  const rest = Object.fromEntries(
                    Object.entries(a.evidence).filter(([key]) => key !== 'reasons')
                  );
                  if (Object.keys(rest).length) {
                    parts.push(Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(', '));
                  }
                  const evidenceStr = parts.join(' — ') || JSON.stringify(a.evidence);
                  return (
                    <li
                      key={a.id}
                      className={`rounded-r border-l-4 py-2 pl-3 pr-2 ${severityColor(a.severity)}`}
                    >
                      <span className="text-sm font-medium text-gray-800">{t(a.titleKey)}</span>
                      <p className="text-xs text-gray-600">{t(a.evidenceKey)}: {evidenceStr}</p>
                      {a.deepLink && (
                        <Link href={a.deepLink} className="text-xs text-[#C6A756] hover:underline">
                          {t('executive.insights.viewLink')}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Trends */}
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.revenueLast4Weeks')}</h2>
              <ExecutiveLineChart
                height={180}
                data={trends.map((tr) => ({ label: tr.weekStart.slice(5), value: tr.revenue }))}
                valueFormat={(n) => (n / 1000).toFixed(0) + 'k'}
              />
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.achievementPctLast4Weeks')}</h2>
              <ExecutiveLineChart
                height={180}
                data={trends.map((tr) => ({ label: tr.weekStart.slice(5), value: tr.achievementPct }))}
                valueFormat={(n) => n + '%'}
              />
            </div>
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.zoneComplianceLast4Weeks')}</h2>
              <ExecutiveLineChart
                height={180}
                data={trends.map((tr) => ({ label: tr.weekStart.slice(5), value: tr.zoneCompliancePct }))}
                valueFormat={(n) => n + '%'}
              />
            </div>
          </div>

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.anomalies')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {anomalies.map((a, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border-l-4 py-2 pl-3 ${severityColor(a.severity)}`}
                  >
                    <p className="text-sm font-medium text-gray-800">{t(a.titleKey)}</p>
                    <p className="text-xs text-gray-600">{t(a.evidenceKey)}: {Object.entries(a.evidence).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                    {a.deepLink && (
                      <Link href={a.deepLink} className="text-xs text-[#C6A756] hover:underline">
                        {t('executive.insights.viewLink')}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Narrative: What changed / Why / Next actions */}
          <div className="rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-500">{t('executive.insights.summary')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">{t('executive.insights.whatChanged')}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                  {insights.narrative.whatChanged.map((w, i) => (
                    <li key={i}>{t(w)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">{t('executive.insights.why')}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                  {insights.narrative.why.length > 0
                    ? insights.narrative.why.map((y, i) => <li key={i}>{t(y)}</li>)
                    : <li>—</li>}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">{t('executive.insights.nextActions')}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                  {insights.narrative.nextActions.map((a, i) => (
                    <li key={i}>{t(a)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
