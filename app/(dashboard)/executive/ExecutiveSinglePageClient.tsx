'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  calcExpectedMTD,
  calcPaceEOM,
  calcHybridForecast,
  calcRequiredPerDay,
} from '@/lib/analytics/execMetrics';
import { getTodayRiyadh, parseRiyadhDateKey } from '@/lib/date/riyadhToday';
import { ExecViewTabs, type ExecPageView } from '@/components/dashboard-ui/ExecViewTabs';
import { ExecBullet } from '@/components/dashboard-ui/ExecBullet';
import { ExecKpiBlock } from '@/components/dashboard-ui/ExecKpiBlock';
import { ExecPanel } from '@/components/dashboard-ui/ExecPanel';

type ExecutiveKpis = {
  revenue: number;
  target: number;
  achievementPct: number;
  overdueTasksPct: number;
  scheduleBalancePct: number;
  riskIndex: number;
  revenueDelta: number | null;
  targetDelta: number | null;
};

type EmployeeRow = {
  userId: string;
  name: string;
  revenueMTD: number;
  employeeMonthlyTarget: number;
  achievementPercent: number;
};

type CompareBoutiqueRow = {
  boutiqueId: string;
  code: string;
  name: string;
  sales: number;
  target: number;
  achievementPct: number | null;
};

type YoYData = {
  lyMtdHalalas: number;
  lyEomHalalas: number;
  lyInvoicesMtd: number;
  lyInvoicesEom: number;
  lyPiecesMtd: number;
  lyPiecesEom: number;
};

type MonthSnapshot = {
  month: string;
  branchCode: string;
  daily: { date: string; netSalesHalalas: number; invoices: number; pieces: number }[];
  staff: { empId?: string; name: string; netSalesHalalas: number; invoices: number; pieces: number; achievementPct?: number }[];
};

type CalibrationScenario = 'Conservative' | 'Base' | 'Aggressive';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function fmtSar0(halalasInt: number): string {
  const sarInt = Math.round(halalasInt / 100);
  return `SAR ${sarInt.toLocaleString()}`;
}
function safeDiv(a: number, b: number): number {
  return b <= 0 ? 0 : a / b;
}
function staffStatus(pct: number): 'Stable' | 'Watch' | 'Coaching' {
  if (pct >= 90) return 'Stable';
  if (pct >= 70) return 'Watch';
  return 'Coaching';
}

function generateExecutiveBrief(input: {
  achPct: number;
  forecastBaseHalalas: number;
  targetHalalas: number;
  requiredPerDayHalalas: number;
  yoyPct: number | null;
  trendConfidence: 'Low' | 'High';
  driverNote: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'Critical';
}): string[] {
  const lines: string[] = [];
  const {
    achPct,
    forecastBaseHalalas,
    targetHalalas,
    requiredPerDayHalalas,
    yoyPct,
    driverNote,
    riskLevel,
  } = input;

  if (achPct >= 90) {
    lines.push(`Performance is on track, achieving ${achPct}% of target.`);
  } else if (achPct >= 70) {
    lines.push(`Performance remains stable at ${achPct}% of target, slightly below full attainment.`);
  } else {
    lines.push(`Performance is materially below plan at ${achPct}% of target.`);
  }

  const gapHalalas = forecastBaseHalalas - targetHalalas;
  if (gapHalalas >= 0) {
    lines.push('Forecast indicates a potential outperformance versus plan.');
  } else {
    const shortfallSar = Math.round(Math.abs(gapHalalas) / 100);
    lines.push(`Forecast projects a shortfall of SAR ${shortfallSar.toLocaleString()} versus plan.`);
  }

  if (yoyPct !== null) {
    if (yoyPct > 5) lines.push(`Strong growth versus last year at +${yoyPct.toFixed(1)}%.`);
    else if (yoyPct >= 0) lines.push(`Modest growth versus last year at +${yoyPct.toFixed(1)}%.`);
    else lines.push(`Contraction versus last year at ${yoyPct.toFixed(1)}%.`);
  } else {
    lines.push('Year-over-year comparison unavailable.');
  }

  lines.push(`Growth is primarily driven by ${driverNote}.`);

  const requiredSar = Math.round(requiredPerDayHalalas / 100);
  lines.push(`Required daily run-rate stands at SAR ${requiredSar.toLocaleString()} per day.`);

  lines.push(`Execution risk level assessed as ${riskLevel}.`);
  return lines.slice(0, 6);
}

function calculateRiskScore(input: {
  achPct: number;
  forecastBaseHalalas: number;
  targetHalalas: number;
  trendConfidence: 'Low' | 'High';
  yoyPct: number | null;
  requiredPerDayHalalas: number;
  avgHistoricalDailyHalalas: number;
  concentrationPct: number;
}): { score: number; level: string } {
  const {
    achPct,
    forecastBaseHalalas,
    targetHalalas,
    trendConfidence,
    yoyPct,
    requiredPerDayHalalas,
    avgHistoricalDailyHalalas,
    concentrationPct,
  } = input;

  let achRisk = 90;
  if (achPct >= 90) achRisk = 0;
  else if (achPct >= 70) achRisk = 40;
  else if (achPct >= 50) achRisk = 70;

  const forecastVsTarget = targetHalalas > 0 ? forecastBaseHalalas / targetHalalas : 1;
  const shortfallPct = 1 - forecastVsTarget;
  let forecastRisk = 0;
  if (forecastVsTarget >= 1) forecastRisk = 0;
  else if (shortfallPct < 0.05) forecastRisk = 40;
  else if (shortfallPct <= 0.1) forecastRisk = 70;
  else forecastRisk = 90;

  const trendRisk = trendConfidence === 'High' ? 20 : 70;

  let yoyRisk = 40;
  if (yoyPct !== null) {
    if (yoyPct > 0) yoyRisk = 20;
    else yoyRisk = 70;
  }

  const ratio = avgHistoricalDailyHalalas > 0 ? requiredPerDayHalalas / avgHistoricalDailyHalalas : 2;
  let paceRisk = 20;
  if (ratio <= 1) paceRisk = 20;
  else if (ratio <= 1.1) paceRisk = 50;
  else paceRisk = 80;

  const concentrationRisk = concentrationPct > 60 ? 80 : 20;

  const score = Math.round(
    achRisk * 0.25 +
      forecastRisk * 0.2 +
      trendRisk * 0.15 +
      yoyRisk * 0.1 +
      paceRisk * 0.15 +
      concentrationRisk * 0.15
  );
  const clampedScore = Math.max(0, Math.min(100, score));

  let level: string;
  if (clampedScore <= 30) level = 'Low';
  else if (clampedScore <= 60) level = 'Moderate';
  else if (clampedScore <= 80) level = 'Elevated';
  else level = 'Critical';

  return { score: clampedScore, level };
}

export function ExecutiveSinglePageClient() {
  const [view, setView] = useState<ExecPageView>('Executive');
  const [kpis, setKpis] = useState<ExecutiveKpis | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [compareBoutiques, setCompareBoutiques] = useState<CompareBoutiqueRow[] | null>(null);
  const [yoyData, setYoyData] = useState<YoYData | null>(null);
  const [monthSnapshot, setMonthSnapshot] = useState<MonthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshRef = useRef<Date | null>(null);

  const [calibrationScenario, setCalibrationScenario] = useState<CalibrationScenario>('Base');
  const [calibrationMaxAdjPct, setCalibrationMaxAdjPct] = useState(8);
  const [calibrationLockDaysLeft, setCalibrationLockDaysLeft] = useState(7);
  const [calibrationUseYoY, setCalibrationUseYoY] = useState(true);

  useEffect(() => {
    fetch('/api/executive')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((data) => {
        setKpis(data.kpis);
        lastRefreshRef.current = new Date();
      })
      .catch(() => setError('Failed to load executive data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const todayKey = getTodayRiyadh();
    const parsed = parseRiyadhDateKey(todayKey);
    if (!parsed) return;
    fetch(`/api/executive/yoy?month=${encodeURIComponent(parsed.monthKey)}&daysPassed=${parsed.daysPassed}`)
      .then((r) => {
        if (r.status === 204) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then(setYoyData)
      .catch(() => setYoyData(null));
  }, []);

  useEffect(() => {
    const todayKey = getTodayRiyadh();
    const parsed = parseRiyadhDateKey(todayKey);
    if (!parsed) return;
    fetch(`/api/executive/month-snapshot?month=${encodeURIComponent(parsed.monthKey)}`)
      .then((r) => {
        if (r.status === 204) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then(setMonthSnapshot)
      .catch(() => setMonthSnapshot(null));
  }, []);

  useEffect(() => {
    if (view !== 'Operator') return;
    fetch('/api/executive/employee-intelligence')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]));
  }, [view]);

  useEffect(() => {
    if (view !== 'Investor') return;
    fetch('/api/executive/compare')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed'))))
      .then((data) => setCompareBoutiques(data.boutiques ?? []))
      .catch(() => setCompareBoutiques([]));
  }, [view]);

  const riyadhToday = useMemo(() => getTodayRiyadh(), []);
  const riyadhParsed = useMemo(() => parseRiyadhDateKey(riyadhToday), [riyadhToday]);
  const totalDays = riyadhParsed?.totalDays ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const daysPassed = riyadhParsed?.daysPassed ?? Math.min(new Date().getDate(), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());

  const last7Prev7 = useMemo(() => {
    if (!monthSnapshot?.daily?.length) return { last7: null as number | null, prev7: null as number | null, trendConfidence: 'Low' as const };
    const todayStr = riyadhToday;
    const sorted = [...monthSnapshot.daily]
      .filter((d) => d.date <= todayStr)
      .sort((a, b) => (b.date > a.date ? 1 : -1));
    const last7Halalas = sorted.slice(0, 7).reduce((s, d) => s + d.netSalesHalalas, 0);
    const prev7Halalas = sorted.slice(7, 14).reduce((s, d) => s + d.netSalesHalalas, 0);
    const useTrend = daysPassed >= 14 && sorted.length >= 14;
    const last7 = sorted.length >= 7 ? last7Halalas / 100 : null;
    const prev7 = useTrend ? prev7Halalas / 100 : null;
    const effectiveLast7 = useTrend ? last7 : null;
    const trendConfidence: 'Low' | 'Medium' | 'High' =
      effectiveLast7 != null && prev7 != null && prev7 > 0 && daysPassed >= 14 && sorted.length >= 14
        ? 'High'
        : effectiveLast7 != null && prev7 != null && prev7 > 0
          ? 'Medium'
          : 'Low';
    return {
      last7: effectiveLast7,
      prev7: useTrend ? prev7 : null,
      trendConfidence,
    };
  }, [monthSnapshot, riyadhToday, daysPassed]);

  const metrics = useMemo(() => {
    if (!kpis) return null;
    const expectedMTD = calcExpectedMTD(kpis.target, daysPassed, totalDays);
    const variance = kpis.revenue - expectedMTD;
    const variancePct = expectedMTD > 0 ? (variance / expectedMTD) * 100 : 0;
    const paceEOM = calcPaceEOM(kpis.revenue, daysPassed, totalDays);
    const lyMtdSar = yoyData && yoyData.lyMtdHalalas > 0 ? yoyData.lyMtdHalalas / 100 : null;
    const lyEomSar = yoyData && yoyData.lyEomHalalas > 0 ? yoyData.lyEomHalalas / 100 : null;
    const forecast = calcHybridForecast({
      mtd: kpis.revenue,
      daysPassed,
      totalDays,
      last7: last7Prev7.last7,
      prev7: last7Prev7.prev7,
      lyMtd: lyMtdSar,
      lyEom: lyEomSar,
      hasYoY: Boolean(lyMtdSar && lyEomSar),
    });
    const requiredPerDay = calcRequiredPerDay(kpis.target, kpis.revenue, totalDays, daysPassed);
    const yoyPct =
      lyMtdSar != null && lyMtdSar > 0
        ? (kpis.revenue / lyMtdSar - 1) * 100
        : null;
    return {
      expectedMTD,
      variance,
      variancePct,
      paceEOM,
      forecast,
      requiredPerDay,
      yoyPct,
    };
  }, [kpis, yoyData, daysPassed, totalDays, last7Prev7]);

  const demandEngine = useMemo(() => {
    if (!monthSnapshot?.daily?.length) return null;
    const totNet = monthSnapshot.daily.reduce((s, d) => s + d.netSalesHalalas, 0);
    const totInvoices = monthSnapshot.daily.reduce((s, d) => s + d.invoices, 0);
    const totPieces = monthSnapshot.daily.reduce((s, d) => s + d.pieces, 0);
    if (totInvoices <= 0) return { invoicesMtd: 0, avgTicket: 0, upt: 0, aiv: 0 };
    const avgTicket = totNet / 100 / totInvoices;
    const upt = totPieces / totInvoices;
    const aiv = totPieces > 0 ? totNet / 100 / totPieces : 0;
    return { invoicesMtd: totInvoices, avgTicket, upt, aiv };
  }, [monthSnapshot]);

  const daysLeft = totalDays - daysPassed;

  const targetCalibration = useMemo(() => {
    if (!kpis || !metrics) return null;
    const currentTargetSar = kpis.target;
    const currentTargetHalalas = currentTargetSar * 100;
    const forecastBaseSar = metrics.forecast.base;
    const lyEomHalalas = yoyData?.lyEomHalalas ?? null;
    const lyEomSar = lyEomHalalas != null && lyEomHalalas > 0 ? lyEomHalalas / 100 : null;
    const locked = daysLeft < calibrationLockDaysLeft;
    const useYoY = calibrationUseYoY && lyEomSar != null && lyEomSar > 0;
    const suggestedBaseRaw =
      useYoY && lyEomSar != null ? 0.55 * lyEomSar + 0.45 * forecastBaseSar : forecastBaseSar;
    const lo = 0.97 * suggestedBaseRaw;
    const base = suggestedBaseRaw;
    const hi = 1.03 * suggestedBaseRaw;
    const maxAdj = calibrationMaxAdjPct / 100;
    const minT = currentTargetSar * (1 - maxAdj);
    const maxT = currentTargetSar * (1 + maxAdj);
    const suggestedLow = locked ? currentTargetSar : clamp(lo, minT, maxT);
    const suggestedBase = locked ? currentTargetSar : clamp(base, minT, maxT);
    const suggestedHigh = locked ? currentTargetSar : clamp(hi, minT, maxT);
    const deltaLowHalalas = (suggestedLow - currentTargetSar) * 100;
    const deltaBaseHalalas = (suggestedBase - currentTargetSar) * 100;
    const deltaHighHalalas = (suggestedHigh - currentTargetSar) * 100;
    const reasoning: string[] = [];
    if (locked) reasoning.push('Target locked: within lock window (end of month).');
    else {
      reasoning.push(yoyData ? 'YoY: available. Base = 0.55×LY EOM + 0.45×Forecast.' : 'YoY: missing. Base = Forecast only.');
      reasoning.push(`Trend confidence: ${last7Prev7.trendConfidence}.`);
      reasoning.push(`Forecast: ${fmtSar0(Math.round(metrics.forecast.low * 100))} / ${fmtSar0(Math.round(metrics.forecast.base * 100))} / ${fmtSar0(Math.round(metrics.forecast.high * 100))}.`);
      if (demandEngine) {
        reasoning.push(`Drivers: Invoices ${demandEngine.invoicesMtd.toLocaleString()}, Avg Ticket ${fmtSar0(Math.round(demandEngine.avgTicket * 100))}, UPT ${demandEngine.upt.toFixed(2)}.`);
      }
    }
    const scenarioValue =
      calibrationScenario === 'Conservative'
        ? suggestedLow
        : calibrationScenario === 'Aggressive'
          ? suggestedHigh
          : suggestedBase;
    const deltaHalalas =
      calibrationScenario === 'Conservative'
        ? deltaLowHalalas
        : calibrationScenario === 'Aggressive'
          ? deltaHighHalalas
          : deltaBaseHalalas;
    return {
      locked,
      currentTargetSar,
      currentTargetHalalas,
      suggestedLow,
      suggestedBase,
      suggestedHigh,
      deltaLowHalalas,
      deltaBaseHalalas,
      deltaHighHalalas,
      scenarioValue,
      deltaHalalas,
      reasoning,
    };
  }, [kpis, metrics, yoyData, daysLeft, calibrationScenario, calibrationMaxAdjPct, calibrationLockDaysLeft, calibrationUseYoY, last7Prev7.trendConfidence, demandEngine]);

  const driverSensitivity = useMemo(() => {
    if (!monthSnapshot?.daily?.length) return null;
    const mtdSalesHalalas = monthSnapshot.daily.reduce((s, d) => s + d.netSalesHalalas, 0);
    const mtdInvoices = monthSnapshot.daily.reduce((s, d) => s + d.invoices, 0);
    const mtdPieces = monthSnapshot.daily.reduce((s, d) => s + d.pieces, 0);
    const avgTicketSar = safeDiv(mtdSalesHalalas / 100, mtdInvoices);
    const upt = safeDiv(mtdPieces, mtdInvoices);
    const aivSar = safeDiv(mtdSalesHalalas / 100, mtdPieces);
    const todayStr = riyadhToday;
    const sorted = [...monthSnapshot.daily]
      .filter((d) => d.date <= todayStr)
      .sort((a, b) => (b.date > a.date ? 1 : -1));
    const last7 = sorted.slice(0, 7);
    const prev7 = sorted.slice(7, 14);
    const sum = (arr: typeof last7, key: 'netSalesHalalas' | 'invoices' | 'pieces') =>
      arr.reduce((s, d) => s + d[key], 0);
    const last7Invoices = sum(last7, 'invoices');
    const last7SalesHalalas = sum(last7, 'netSalesHalalas');
    const last7Pieces = sum(last7, 'pieces');
    const prev7Invoices = sum(prev7, 'invoices');
    const prev7SalesHalalas = sum(prev7, 'netSalesHalalas');
    const prev7Pieces = sum(prev7, 'pieces');
    const wowRatio = (a: number, b: number) => (b > 0 ? a / b - 1 : 0);
    const wowInvoicesPct = wowRatio(last7Invoices, prev7Invoices) * 100;
    const last7AvgTicketSar = safeDiv(last7SalesHalalas / 100, last7Invoices);
    const prev7AvgTicketSar = safeDiv(prev7SalesHalalas / 100, prev7Invoices);
    const wowAvgTicketPct = prev7AvgTicketSar > 0 ? wowRatio(last7AvgTicketSar, prev7AvgTicketSar) * 100 : 0;
    const last7UptVal = safeDiv(last7Pieces, last7Invoices);
    const prev7UptVal = safeDiv(prev7Pieces, prev7Invoices);
    const wowUptPct = prev7UptVal > 0 ? wowRatio(last7UptVal, prev7UptVal) * 100 : 0;
    const last7AivSar = safeDiv(last7SalesHalalas / 100, last7Pieces);
    const prev7AivSar = safeDiv(prev7SalesHalalas / 100, prev7Pieces);
    const wowAivPct = prev7AivSar > 0 ? wowRatio(last7AivSar, prev7AivSar) * 100 : 0;
    const abs = (x: number) => (Number.isFinite(x) ? Math.abs(x) : 0);
    const magInv = abs(wowInvoicesPct);
    const magTicket = abs(wowAvgTicketPct);
    const magUpt = abs(wowUptPct);
    const magAiv = abs(wowAivPct);
    const maxMag = Math.max(magInv, magTicket, magUpt, magAiv);
    let driverNote = 'Drivers are stable; forecast mainly pace-based.';
    if (maxMag > 0) {
      if (magInv >= maxMag && wowInvoicesPct > 0) driverNote = 'Growth driven by demand (invoices).';
      else if (magTicket >= maxMag && wowAvgTicketPct > 0) driverNote = 'Growth driven by ticket size.';
      else if (magUpt >= maxMag && wowUptPct > 0) driverNote = 'Growth driven by basket building.';
      else if (magAiv >= maxMag && wowAivPct > 0) driverNote = 'Growth driven by item value.';
    }
    return {
      mtdSalesHalalas,
      mtdInvoices,
      mtdPieces,
      invoicesMtd: mtdInvoices,
      avgTicket: avgTicketSar,
      upt,
      aiv: aivSar,
      wowInvoices: wowInvoicesPct,
      wowAvgTicket: wowAvgTicketPct,
      wowUpt: wowUptPct,
      wowAiv: wowAivPct,
      driverNote,
    };
  }, [monthSnapshot, riyadhToday]);

  const staffSegments = useMemo(() => {
    if (!monthSnapshot?.staff?.length) return null;
    const totalSar = monthSnapshot.staff.reduce((s, r) => s + r.netSalesHalalas / 100, 0);
    const rows = monthSnapshot.staff.map((r) => {
      const salesSar = r.netSalesHalalas / 100;
      const inv = r.invoices;
      const contribution = totalSar > 0 ? (salesSar / totalSar) * 100 : 0;
      const avgTicket = safeDiv(salesSar, inv);
      const upt = safeDiv(r.pieces, inv);
      return { name: r.name, invoices: inv, pieces: r.pieces, avgTicket, upt, contribution };
    });
    const n = rows.length;
    if (n < 2) return null;
    const q = Math.max(1, Math.floor(n / 4));
    const bottomQ = Math.max(1, Math.ceil(n / 4));
    const byAvgTicket = [...rows].sort((a, b) => b.avgTicket - a.avgTicket);
    const byInvoices = [...rows].sort((a, b) => b.invoices - a.invoices);
    const byUpt = [...rows].sort((a, b) => b.upt - a.upt);
    const highValueBuilders = byAvgTicket.slice(0, q);
    const volumeDrivers = byInvoices.slice(0, q);
    const basketBuilders = byUpt.slice(0, q);
    const bottomAvgTicket = new Set(byAvgTicket.slice(-bottomQ).map((r) => r.name));
    const bottomInvoices = new Set(byInvoices.slice(-bottomQ).map((r) => r.name));
    const bottomUpt = new Set(byUpt.slice(-bottomQ).map((r) => r.name));
    const contributions = rows.map((r) => r.contribution).sort((a, b) => a - b);
    const medianContribution = contributions[Math.floor(contributions.length / 2)] ?? 0;
    const atRisk = rows.filter((r) => {
      let count = 0;
      if (bottomAvgTicket.has(r.name)) count++;
      if (bottomInvoices.has(r.name)) count++;
      if (bottomUpt.has(r.name)) count++;
      return count >= 2 && r.contribution < medianContribution;
    });
    return {
      highValueBuilders: { list: highValueBuilders, count: highValueBuilders.length, top3: highValueBuilders.slice(0, 3).map((r) => r.name) },
      volumeDrivers: { list: volumeDrivers, count: volumeDrivers.length, top3: volumeDrivers.slice(0, 3).map((r) => r.name) },
      basketBuilders: { list: basketBuilders, count: basketBuilders.length, top3: basketBuilders.slice(0, 3).map((r) => r.name) },
      atRisk: { list: atRisk, count: atRisk.length, top3: atRisk.slice(0, 3).map((r) => r.name) },
    };
  }, [monthSnapshot]);

  const concentrationPct = useMemo(() => {
    if (!monthSnapshot?.staff?.length) return 0;
    const totalSar = monthSnapshot.staff.reduce((s, r) => s + r.netSalesHalalas / 100, 0);
    if (totalSar <= 0) return 0;
    const contrib = monthSnapshot.staff
      .map((r) => (r.netSalesHalalas / 100 / totalSar) * 100)
      .sort((a, b) => b - a);
    return contrib.slice(0, 2).reduce((s, c) => s + c, 0);
  }, [monthSnapshot]);

  const avgHistoricalDailyHalalas = useMemo(() => {
    if (daysPassed <= 0) return 0;
    return (kpis?.revenue ?? 0) * 100 / daysPassed;
  }, [kpis?.revenue, daysPassed]);

  const riskScoreResult = useMemo(() => {
    if (!kpis || !metrics) return null;
    const targetHalalas = kpis.target * 100;
    const forecastBaseHalalas = metrics.forecast.base * 100;
    const requiredPerDayHalalas = (metrics.requiredPerDay ?? 0) * 100;
    const trendConfidence: 'Low' | 'High' = last7Prev7.trendConfidence === 'Low' ? 'Low' : 'High';
    return calculateRiskScore({
      achPct: kpis.achievementPct,
      forecastBaseHalalas,
      targetHalalas,
      trendConfidence,
      yoyPct: metrics.yoyPct,
      requiredPerDayHalalas,
      avgHistoricalDailyHalalas,
      concentrationPct,
    });
  }, [kpis, metrics, last7Prev7.trendConfidence, avgHistoricalDailyHalalas, concentrationPct]);

  const executiveBriefLines = useMemo(() => {
    if (!kpis || !metrics || !riskScoreResult) return null;
    const targetHalalas = kpis.target * 100;
    const forecastBaseHalalas = metrics.forecast.base * 100;
    const requiredPerDayHalalas = (metrics.requiredPerDay ?? 0) * 100;
    const trendConfidence: 'Low' | 'High' = last7Prev7.trendConfidence === 'Low' ? 'Low' : 'High';
    const driverNote = driverSensitivity?.driverNote ?? 'pace and execution.';
    const riskLevel = riskScoreResult.level as 'Low' | 'Moderate' | 'Elevated' | 'Critical';
    return generateExecutiveBrief({
      achPct: kpis.achievementPct,
      forecastBaseHalalas,
      targetHalalas,
      requiredPerDayHalalas,
      yoyPct: metrics.yoyPct,
      trendConfidence,
      driverNote,
      riskLevel,
    });
  }, [kpis, metrics, riskScoreResult, last7Prev7.trendConfidence, driverSensitivity?.driverNote]);

  if (error) {
    return (
      <div className="min-w-0 p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const paceStatus =
    metrics && kpis
      ? (metrics.paceEOM >= kpis.target ? 'ok' : metrics.paceEOM >= kpis.target * 0.9 ? 'watch' : 'action')
      : 'watch';

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Executive</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {view === 'Executive' && 'Revenue health & hybrid forecast'}
            {view === 'Operator' && 'Employee performance'}
            {view === 'Investor' && 'Branch-only view'}
          </p>
        </div>
        <ExecViewTabs value={view} onChange={setView} />
      </header>

      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-600">
        <span className="shrink-0">
          <span className="font-medium text-slate-500">Snapshot:</span>{' '}
          {monthSnapshot ? (
            <span className="text-emerald-700">Present</span>
          ) : (
            <span className="text-slate-500">Missing</span>
          )}
        </span>
        <span className="shrink-0">
          <span className="font-medium text-slate-500">YoY:</span>{' '}
          {yoyData ? (
            <span className="text-emerald-700">Present</span>
          ) : (
            <span className="text-slate-500">Missing</span>
          )}
        </span>
        <span className="shrink-0">
          <span className="font-medium text-slate-500">Last refresh:</span>{' '}
          {lastRefreshRef.current
            ? lastRefreshRef.current.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
            : '—'}
        </span>
      </div>

      {(loading || !kpis) && (
        <section className="min-w-0">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-slate-500">Loading executive data…</p>
          </div>
        </section>
      )}

      {!(loading || !kpis) && view === 'Executive' && metrics && (
        <>
          <section className="min-w-0">
            <ExecPanel
              title="Revenue Health"
              subtitle="MTD vs expected progress; hybrid forecast (pace + trend when available)."
            >
              <div className="grid min-w-0 grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
                  <ExecKpiBlock
                    title="MTD"
                    actual={`${Math.round(kpis.revenue).toLocaleString()} SAR`}
                    target=""
                    variance={metrics.variance >= 0 ? `+${metrics.variance.toLocaleString()}` : metrics.variance.toLocaleString()}
                    variancePct={metrics.variancePct != null ? `${(metrics.variancePct >= 0 ? '+' : '')}${metrics.variancePct.toFixed(1)}%` : undefined}
                    status={kpis.achievementPct >= 90 ? 'ok' : kpis.achievementPct >= 75 ? 'watch' : 'action'}
                    footnote="Month-to-date revenue. Ach% = revenue vs target."
                    bullet={
                      <ExecBullet
                        value={kpis.revenue}
                        target={kpis.target}
                        max={Math.max(kpis.target * 1.2, kpis.revenue)}
                        thresholds={{ good: kpis.target * 0.9, watch: kpis.target * 0.75 }}
                        height={16}
                      />
                    }
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
                  <ExecKpiBlock
                    title="Expected MTD"
                    actual={Math.round(metrics.expectedMTD).toLocaleString()}
                    target="SAR"
                    footnote="(Target / total days) × days passed."
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
                  <ExecKpiBlock
                    title="Pace status"
                    actual={`${Math.round(metrics.paceEOM).toLocaleString()} EOM`}
                    target="SAR"
                    status={paceStatus}
                    footnote="Pace EOM = run-rate to end of month (MTD/days passed × total days)."
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
                  <ExecKpiBlock
                    title="Required/day"
                    actual={
                      metrics.requiredPerDay != null
                        ? `${fmtSar0(Math.max(0, Math.round(metrics.requiredPerDay * 100)))} / day`
                        : '—'
                    }
                    target=""
                    footnote="To hit target from here to month end."
                  />
                </div>
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-12 gap-4 border-t border-slate-100 pt-4">
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Forecast (Low / Base / High)</p>
                  <p className="mt-1 text-sm tabular-nums text-slate-900">
                    {fmtSar0(Math.round(metrics.forecast.low * 100))} / {fmtSar0(Math.round(metrics.forecast.base * 100))} / {fmtSar0(Math.round(metrics.forecast.high * 100))}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Base = {metrics.forecast.source}; Low = Base×0.93, High = Base×1.07.</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Trend confidence: <span className={last7Prev7.trendConfidence === 'High' ? 'text-emerald-600 font-medium' : last7Prev7.trendConfidence === 'Medium' ? 'text-amber-600 font-medium' : 'text-slate-500'}>{last7Prev7.trendConfidence}</span>
                  </p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">WoW</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {kpis.revenueDelta != null ? `${kpis.revenueDelta >= 0 ? '+' : ''}${kpis.revenueDelta}% vs prev month` : '—'}
                  </p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">YoY</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {metrics.yoyPct != null ? `${(metrics.yoyPct >= 0 ? '+' : '')}${metrics.yoyPct.toFixed(1)}% vs same period LY` : '—'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">When available, forecast uses 55% trend + 45% YoY.</p>
                </div>
                {yoyData && (
                  <div className="col-span-12 min-w-0 md:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Revenue Index</p>
                    <p className="mt-1 text-sm text-slate-900">{kpis.achievementPct}% of target</p>
                  </div>
                )}
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                <strong>MIS:</strong> Ach% = revenue vs target. Pace = run-rate to EOM (MTD/days passed × total days). Forecast = Hybrid D: 55% trend + 45% YoY when both available; trend uses last 7 vs prev 7 days (Asia/Riyadh); otherwise pace or trend only. Trend comparator window: 7+7 days; trend used only when ≥14 days passed and ≥14 daily rows. Low/Medium/High confidence when trend inputs insufficient / partial / full.
              </p>
            </ExecPanel>
          </section>

          {executiveBriefLines && (
            <section className="min-w-0">
              <ExecPanel
                title="Executive Narrative"
                subtitle="Board-ready brief. Neutral tone."
              >
                <div className="space-y-3 text-sm leading-relaxed text-slate-700">
                  {executiveBriefLines.map((line, i) => (
                    <p key={i} className="min-w-0">
                      {line}
                    </p>
                  ))}
                </div>
              </ExecPanel>
            </section>
          )}

          {riskScoreResult && (
            <section className="min-w-0">
              <ExecPanel
                title="Risk Assessment"
                subtitle="Weighted risk score 0–100. No red."
              >
                <div className="flex min-w-0 flex-wrap items-start gap-6">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Risk Score</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{riskScoreResult.score}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Risk Level</p>
                    <p className="mt-1">
                      <span
                        className={
                          riskScoreResult.level === 'Low'
                            ? 'inline-block rounded bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-800 border border-emerald-200'
                            : riskScoreResult.level === 'Moderate' || riskScoreResult.level === 'Elevated'
                              ? 'inline-block rounded bg-amber-50 px-2 py-1 text-sm font-medium text-amber-800 border border-amber-200'
                              : 'inline-block rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-800 border border-slate-300'
                        }
                      >
                        {riskScoreResult.level}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 min-w-0 overflow-x-auto">
                  <table className="w-full min-w-0 table-fixed border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="py-2 px-3 text-left font-medium text-slate-500">Component</th>
                        <th className="py-2 px-3 text-right font-medium text-slate-500">Weight</th>
                        <th className="py-2 px-3 text-right font-medium text-slate-500">Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">Achievement</td><td className="py-2 px-3 text-right text-slate-500">25%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">Forecast</td><td className="py-2 px-3 text-right text-slate-500">20%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">Trend</td><td className="py-2 px-3 text-right text-slate-500">15%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">YoY</td><td className="py-2 px-3 text-right text-slate-500">10%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">Pace pressure</td><td className="py-2 px-3 text-right text-slate-500">15%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                      <tr className="border-b border-slate-100"><td className="py-2 px-3 text-slate-700">Concentration</td><td className="py-2 px-3 text-right text-slate-500">15%</td><td className="py-2 px-3 text-right tabular-nums text-slate-700">—</td></tr>
                    </tbody>
                  </table>
                </div>
              </ExecPanel>
            </section>
          )}

          <section className="min-w-0">
            <ExecPanel
              title="Target Calibration (Scenario)"
              subtitle="Suggested target range by scenario. Client state only; no persistence."
            >
              {!kpis || !metrics ? (
                <p className="text-sm text-slate-500">—</p>
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-12">
                    <div className="min-w-0 sm:col-span-4">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Scenario</p>
                      <div className="mt-1 flex min-w-0 rounded border border-slate-300 bg-slate-50/50 p-0.5" role="tablist">
                        {(['Conservative', 'Base', 'Aggressive'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="tab"
                            aria-selected={calibrationScenario === s}
                            onClick={() => setCalibrationScenario(s)}
                            className={`min-w-0 flex-1 truncate rounded px-2 py-2 text-center text-sm font-medium transition-colors ${
                              calibrationScenario === s
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Max adj %</p>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={calibrationMaxAdjPct}
                        onChange={(e) => setCalibrationMaxAdjPct(Number(e.target.value) || 8)}
                        className="mt-1 block w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Lock if days left &lt;</p>
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={calibrationLockDaysLeft}
                        onChange={(e) => setCalibrationLockDaysLeft(Number(e.target.value) ?? 7)}
                        className="mt-1 block w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex min-w-0 items-end sm:col-span-4">
                      <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={calibrationUseYoY}
                          onChange={(e) => setCalibrationUseYoY(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        Use YoY weighting
                      </label>
                    </div>
                  </div>
                  {targetCalibration && (
                    <>
                      {targetCalibration.locked && (
                        <p className="mt-3 inline-block rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
                          Locked (end of month)
                        </p>
                      )}
                      <div className={`mt-4 grid min-w-0 grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-12 ${targetCalibration.locked ? 'opacity-60' : ''}`}>
                        <div className="min-w-0 sm:col-span-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Current Target</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fmtSar0(targetCalibration.currentTargetHalalas)}</p>
                        </div>
                        <div className="min-w-0 sm:col-span-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Suggested Target (selected)</p>
                          <p className="mt-1 text-sm tabular-nums text-slate-900">
                            {targetCalibration.locked ? '—' : fmtSar0(Math.round(targetCalibration.scenarioValue * 100))}
                          </p>
                        </div>
                        <div className="min-w-0 sm:col-span-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Suggested Range (Low / Base / High)</p>
                          <p className="mt-1 text-sm tabular-nums text-slate-900">
                            {targetCalibration.locked
                              ? '—'
                              : `${fmtSar0(Math.round(targetCalibration.suggestedLow * 100))} / ${fmtSar0(Math.round(targetCalibration.suggestedBase * 100))} / ${fmtSar0(Math.round(targetCalibration.suggestedHigh * 100))}`}
                          </p>
                        </div>
                        <div className="min-w-0 sm:col-span-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Delta vs current</p>
                          <p className="mt-1 text-sm tabular-nums text-slate-900">
                            {targetCalibration.locked ? '—' : (() => {
                              const deltaSarInt = Math.round(targetCalibration.deltaHalalas / 100);
                              if (deltaSarInt > 0) return `+SAR ${deltaSarInt.toLocaleString()}`;
                              if (deltaSarInt < 0) return `-SAR ${Math.abs(deltaSarInt).toLocaleString()}`;
                              return 'SAR 0';
                            })()}
                          </p>
                        </div>
                      </div>
                      <ul className="mt-3 list-inside list-disc space-y-1 text-[11px] text-slate-600">
                        {targetCalibration.reasoning.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                      <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                        <strong>MIS:</strong> Suggested base = 0.55×LY EOM + 0.45×Forecast base when YoY available; else Forecast base. Conservative = base×0.97, Aggressive = base×1.03. Clamped to current target ± max adj %. Lock when days left &lt; threshold.
                      </p>
                    </>
                  )}
                </>
              )}
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Demand Engine" subtitle="Traffic and conversion proxy (from MTD). From monthly snapshot when available.">
              <div className="grid min-w-0 grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 md:col-span-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Txn MTD</p>
                  <p className="mt-1 text-sm tabular-nums text-slate-900">{demandEngine ? demandEngine.invoicesMtd.toLocaleString() : '—'}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{demandEngine ? 'From snapshot.' : 'From ledger when available.'}</p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Avg Ticket</p>
                  <p className="mt-1 text-sm tabular-nums text-slate-900">{demandEngine ? fmtSar0(Math.round(demandEngine.avgTicket * 100)) : '—'}</p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">UPT</p>
                  <p className="mt-1 text-sm tabular-nums text-slate-900">{demandEngine ? demandEngine.upt.toFixed(2) : '—'}</p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">AIV</p>
                  <p className="mt-1 text-sm tabular-nums text-slate-900">{demandEngine ? fmtSar0(Math.round(demandEngine.aiv * 100)) : '—'}</p>
                </div>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                <strong>MIS:</strong> Txn MTD = transactions month-to-date. Avg Ticket = revenue / transactions (SAR). UPT = units per transaction. AIV = average item value (SAR per unit).
              </p>
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Productivity" subtitle="Schedule balance and task health.">
              <div className="grid min-w-0 grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <ExecKpiBlock
                    title="Schedule Balance %"
                    actual={`${kpis.scheduleBalancePct}%`}
                    target="≥95%"
                    status={kpis.scheduleBalancePct >= 95 ? 'ok' : kpis.scheduleBalancePct >= 85 ? 'watch' : 'action'}
                    footnote="AM/PM balance."
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <ExecKpiBlock
                    title="Overdue Tasks %"
                    actual={`${kpis.overdueTasksPct}%`}
                    target="&lt;10%"
                    status={kpis.overdueTasksPct <= 10 ? 'ok' : kpis.overdueTasksPct <= 20 ? 'watch' : 'action'}
                    footnote="Weekly task completion."
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <ExecKpiBlock
                    title="Risk Index"
                    actual={String(kpis.riskIndex)}
                    target="&lt;30"
                    status={kpis.riskIndex <= 30 ? 'ok' : kpis.riskIndex <= 50 ? 'watch' : 'action'}
                    footnote="Composite risk score."
                  />
                </div>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                <strong>MIS:</strong> Schedule Balance = AM/PM balance. Overdue Tasks = weekly task completion. Risk Index = composite operational risk score.
              </p>
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel
              title="Forecast Sensitivity (Drivers)"
              subtitle="Driver grid and WoW change from last 7 vs prev 7 days when snapshot available."
            >
              {driverSensitivity ? (
                <>
                  <div className="grid min-w-0 grid-cols-12 gap-4">
                    <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Invoices MTD</p>
                      <p className="mt-1 text-sm tabular-nums text-slate-900">{driverSensitivity.invoicesMtd.toLocaleString()}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">WoW: {driverSensitivity.wowInvoices >= 0 ? '+' : ''}{driverSensitivity.wowInvoices.toFixed(1)}%</p>
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Avg Ticket</p>
                      <p className="mt-1 text-sm tabular-nums text-slate-900">{fmtSar0(Math.round(driverSensitivity.avgTicket * 100))}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">WoW: {driverSensitivity.wowAvgTicket >= 0 ? '+' : ''}{driverSensitivity.wowAvgTicket.toFixed(1)}%</p>
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">UPT</p>
                      <p className="mt-1 text-sm tabular-nums text-slate-900">{driverSensitivity.upt.toFixed(2)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">WoW: {driverSensitivity.wowUpt >= 0 ? '+' : ''}{driverSensitivity.wowUpt.toFixed(1)}%</p>
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">AIV</p>
                      <p className="mt-1 text-sm tabular-nums text-slate-900">{fmtSar0(Math.round(driverSensitivity.aiv * 100))}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">WoW: {driverSensitivity.wowAiv >= 0 ? '+' : ''}{driverSensitivity.wowAiv.toFixed(1)}%</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-600">{driverSensitivity.driverNote}</p>
                  <p className="mt-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                    <strong>MIS:</strong> Invoices = transactions MTD. Avg Ticket = revenue/invoices (SAR). UPT = pieces/invoice. AIV = revenue/piece (SAR). WoW = (last7/prev7) − 1.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-12 gap-4">
                    <div className="col-span-12 min-w-0 md:col-span-3"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Invoices MTD</p><p className="mt-1 text-sm text-slate-500">—</p></div>
                    <div className="col-span-12 min-w-0 md:col-span-3"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Avg Ticket</p><p className="mt-1 text-sm text-slate-500">—</p></div>
                    <div className="col-span-12 min-w-0 md:col-span-3"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">UPT</p><p className="mt-1 text-sm text-slate-500">—</p></div>
                    <div className="col-span-12 min-w-0 md:col-span-3"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">AIV</p><p className="mt-1 text-sm text-slate-500">—</p></div>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Upload monthly snapshot to enable driver analysis.</p>
                </>
              )}
            </ExecPanel>
          </section>
        </>
      )}

      {!(loading || !kpis) && view === 'Operator' && (() => {
        const useSnapshotStaff = Boolean(monthSnapshot?.staff?.length);
        const snapshotTotal = useSnapshotStaff
          ? (monthSnapshot!.staff.reduce((s, r) => s + r.netSalesHalalas, 0) / 100)
          : 0;
        const operatorRows = useSnapshotStaff
          ? monthSnapshot!.staff.map((r, i) => {
              const salesSar = r.netSalesHalalas / 100;
              const contribution = snapshotTotal > 0 ? (salesSar / snapshotTotal) * 100 : 0;
              const avgTicket = r.invoices > 0 ? salesSar / r.invoices : 0;
              const upt = r.invoices > 0 ? r.pieces / r.invoices : 0;
              const pct = r.achievementPct ?? 0;
              return {
                key: r.empId ?? `snapshot-${i}`,
                name: r.name,
                salesSar,
                targetPct: r.achievementPct != null ? `${r.achievementPct}%` : '—',
                contribution,
                invoices: r.invoices,
                avgTicket,
                upt,
                gap: '—' as const,
                status: staffStatus(pct),
              };
            })
          : employees == null
            ? null
            : employees.map((e) => {
                const totalRev = employees!.reduce((s, x) => s + x.revenueMTD, 0);
                const contribution = totalRev > 0 ? (e.revenueMTD / totalRev) * 100 : 0;
                const gap = e.employeeMonthlyTarget - e.revenueMTD;
                return {
                  key: e.userId,
                  name: e.name,
                  salesSar: e.revenueMTD,
                  targetPct: `${e.achievementPercent}%`,
                  contribution,
                  invoices: '—' as const,
                  avgTicket: '—' as const,
                  upt: '—' as const,
                  gap: `${Math.round(gap).toLocaleString()} SAR`,
                  status: staffStatus(e.achievementPercent),
                };
              });
        const loading = !useSnapshotStaff && employees == null;
        const rows = operatorRows ?? [];
        return (
          <>
          <section className="min-w-0">
            <ExecPanel
              title="Employee performance"
              subtitle={useSnapshotStaff ? 'From monthly snapshot (real). Status: ≥90 Stable, 70–89 Watch, &lt;70 Coaching.' : 'Sales, % target, contribution. Status: ≥90 Stable, 70–89 Watch, &lt;70 Coaching.'}
            >
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-slate-500">No employee data.</p>
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Employee</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Sales</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">% Target</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Contribution</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Invoices</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">AvgTicket</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">UPT</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Gap</th>
                        <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                          <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{row.name}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{typeof row.salesSar === 'number' ? `${Math.round(row.salesSar).toLocaleString()} SAR` : row.salesSar}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{row.targetPct}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{row.contribution.toFixed(1)}%</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{typeof row.invoices === 'number' ? row.invoices.toLocaleString() : row.invoices}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{typeof row.avgTicket === 'number' ? `${Math.round(row.avgTicket).toLocaleString()} SAR` : row.avgTicket}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{typeof row.upt === 'number' ? row.upt.toFixed(2) : row.upt}</td>
                          <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{row.gap}</td>
                          <td className="max-w-0 py-3 px-3 truncate">
                            <span
                              className={
                                row.status === 'Stable'
                                  ? 'text-emerald-700'
                                  : row.status === 'Watch'
                                  ? 'text-amber-700'
                                  : 'text-amber-800'
                              }
                            >
                              {row.status}
                            </span>
                            {row.status === 'Coaching' && (
                              <span className="ms-1 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                Flag
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ExecPanel>
          </section>

          {staffSegments && (
            <section className="min-w-0">
              <ExecPanel
                title="Staff Intelligence Deep Dive"
                subtitle="Segments from snapshot: top quartile by metric; at-risk = bottom quartile in 2+ metrics."
              >
                <div className="grid min-w-0 grid-cols-12 gap-4">
                  <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">High Value Builders (top quartile avg ticket)</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">{staffSegments.highValueBuilders.count} staff</p>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                      {staffSegments.highValueBuilders.top3.map((name, i) => (
                        <li key={i} className="truncate">{name}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-slate-500">Focus on maintaining ticket quality and mix.</p>
                  </div>
                  <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Volume Drivers (top quartile invoices)</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">{staffSegments.volumeDrivers.count} staff</p>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                      {staffSegments.volumeDrivers.top3.map((name, i) => (
                        <li key={i} className="truncate">{name}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-slate-500">Strong demand capture; consider basket expansion.</p>
                  </div>
                  <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Basket Builders (top quartile UPT)</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">{staffSegments.basketBuilders.count} staff</p>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                      {staffSegments.basketBuilders.top3.map((name, i) => (
                        <li key={i} className="truncate">{name}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-slate-500">Leverage for cross-sell and add-on.</p>
                  </div>
                  <div className="col-span-12 min-w-0 md:col-span-6 lg:col-span-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">At Risk (bottom quartile in 2+ metrics, contribution below median)</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">{staffSegments.atRisk.count} staff</p>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">
                      {staffSegments.atRisk.top3.map((name, i) => (
                        <li key={i} className="truncate">{name}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] text-slate-500">Review support and priorities.</p>
                  </div>
                </div>
                <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                  <strong>MIS:</strong> Quartiles from snapshot staff. High Value = top 25% avg ticket; Volume = top 25% invoices; Basket = top 25% UPT; At Risk = bottom quartile in ≥2 of (avg ticket, invoices, UPT) and contribution below median.
                </p>
              </ExecPanel>
            </section>
          )}
          </>
        );
      })()}

      {!(loading || !kpis) && view === 'Investor' && (
        <>
        {executiveBriefLines && (
          <section className="min-w-0">
            <ExecPanel
              title="Executive Narrative"
              subtitle="Board-ready brief. Neutral tone; no staff names."
            >
              <div className="space-y-3 text-sm leading-relaxed text-slate-700">
                {executiveBriefLines.map((line, i) => (
                  <p key={i} className="min-w-0">
                    {line}
                  </p>
                ))}
              </div>
            </ExecPanel>
          </section>
        )}

        <section className="min-w-0">
          <ExecPanel
            title="Investor Summary"
            subtitle="Branch summary for active boutique. No staff names or operational metrics."
          >
          {(() => {
            const branchMtd = kpis.revenue;
            const growthVsLy = metrics?.yoyPct ?? null;
            const forecastLow = metrics?.forecast.low ?? 0;
            const forecastBase = metrics?.forecast.base ?? 0;
            const forecastHigh = metrics?.forecast.high ?? 0;
            const requiredPerDay = metrics?.requiredPerDay ?? null;
            const concentrationRisk =
              monthSnapshot?.staff?.length &&
              (() => {
                const totalSar = monthSnapshot.staff.reduce((s, r) => s + r.netSalesHalalas / 100, 0);
                if (totalSar <= 0) return false;
                const contrib = monthSnapshot.staff
                  .map((r) => (r.netSalesHalalas / 100 / totalSar) * 100)
                  .sort((a, b) => b - a);
                const top2 = contrib.slice(0, 2).reduce((s, c) => s + c, 0);
                return top2 > 60;
              })();
            const riskFlags: string[] = [];
            if (last7Prev7.trendConfidence === 'Low') riskFlags.push('Trend confidence Low');
            if (!yoyData) riskFlags.push('YoY missing');
            if (!monthSnapshot) riskFlags.push('Snapshot missing');
            if (concentrationRisk) riskFlags.push('Concentration risk (top 2 contribution &gt;60%)');
            const driverNote = driverSensitivity?.driverNote ?? '';
            const packActionItems = [
              kpis.target > 0 && branchMtd < kpis.target && requiredPerDay != null && requiredPerDay > 0 && `Pace: ${fmtSar0(Math.max(0, Math.round(requiredPerDay * 100)))} / day required to hit target.`,
              growthVsLy != null && growthVsLy < 0 && `YoY: growth vs LY ${growthVsLy.toFixed(1)}%.`,
              driverNote && driverNote !== 'Drivers are stable; forecast mainly pace-based.' && `Drivers: ${driverNote}`,
              riskFlags.length > 0 && `Risks: ${riskFlags.join('; ')}.`,
            ].filter((t): t is string => Boolean(t)).slice(0, 3);
            if (packActionItems.length === 0) packActionItems.push('No priority actions.');
            return (
              <div className="min-w-0 space-y-4">
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-12">
                  <div className="min-w-0 sm:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Branch MTD Revenue</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fmtSar0(Math.round(branchMtd * 100))}</p>
                  </div>
                  <div className="min-w-0 sm:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Growth vs LY</p>
                    <p className="mt-1 text-lg tabular-nums text-slate-900">{growthVsLy != null ? `${(growthVsLy >= 0 ? '+' : '')}${growthVsLy.toFixed(1)}%` : '—'}</p>
                  </div>
                  <div className="min-w-0 sm:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Forecast (Low / Base / High)</p>
                    <p className="mt-1 text-sm tabular-nums text-slate-900">
                      {fmtSar0(Math.round(forecastLow * 100))} / {fmtSar0(Math.round(forecastBase * 100))} / {fmtSar0(Math.round(forecastHigh * 100))}
                    </p>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-12">
                  <div className="min-w-0 sm:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Required/day</p>
                    <p className="mt-1 text-sm tabular-nums text-slate-900">{requiredPerDay != null ? `${fmtSar0(Math.max(0, Math.round(requiredPerDay * 100)))} / day` : '—'}</p>
                  </div>
                  <div className="min-w-0 sm:col-span-8">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Risk flags</p>
                    <p className="mt-1 text-sm text-slate-700">{riskFlags.length > 0 ? riskFlags.join(' · ') : 'None'}</p>
                  </div>
                </div>
                {riskScoreResult && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Risk Assessment</p>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-4">
                      <span className="text-2xl font-semibold tabular-nums text-slate-900">{riskScoreResult.score}</span>
                      <span
                        className={
                          riskScoreResult.level === 'Low'
                            ? 'rounded bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-800 border border-emerald-200'
                            : riskScoreResult.level === 'Moderate' || riskScoreResult.level === 'Elevated'
                              ? 'rounded bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-800 border border-amber-200'
                              : 'rounded bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-800 border border-slate-300'
                        }
                      >
                        {riskScoreResult.level}
                      </span>
                    </div>
                    <div className="mt-2 min-w-0 overflow-x-auto">
                      <table className="w-full min-w-0 table-fixed border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="py-1.5 px-2 text-left font-medium text-slate-500">Component</th>
                            <th className="py-1.5 px-2 text-right font-medium text-slate-500">Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">Achievement</td><td className="py-1.5 px-2 text-right text-slate-500">25%</td></tr>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">Forecast</td><td className="py-1.5 px-2 text-right text-slate-500">20%</td></tr>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">Trend</td><td className="py-1.5 px-2 text-right text-slate-500">15%</td></tr>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">YoY</td><td className="py-1.5 px-2 text-right text-slate-500">10%</td></tr>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">Pace pressure</td><td className="py-1.5 px-2 text-right text-slate-500">15%</td></tr>
                          <tr className="border-b border-slate-100"><td className="py-1.5 px-2 text-slate-700">Concentration</td><td className="py-1.5 px-2 text-right text-slate-500">15%</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Action plan (top 3)</p>
                  <ul className="mt-2 space-y-2">
                    {packActionItems.map((text, i) => (
                      <li key={i} className="flex min-w-0 items-start gap-2 rounded border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700">
                        <span className="shrink-0 font-medium tabular-nums text-slate-500">{i + 1}.</span>
                        <span className="min-w-0 flex-1">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()}
          </ExecPanel>
        </section>

        <section className="min-w-0">
          <ExecPanel
            title="Branch view"
            subtitle="Revenue, YoY, forecast, required pace. Branch comparison and action plan. No staff identifiers or operational metrics."
          >
            {compareBoutiques == null ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : compareBoutiques.length === 0 ? (
              <p className="text-sm text-slate-500">No branch data.</p>
            ) : (
              (() => {
                const totalRevenue = compareBoutiques.reduce((s, b) => s + b.sales, 0);
                const totalTarget = compareBoutiques.reduce((s, b) => s + b.target, 0);
                const networkAch = totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : null;
                const daysPassedInv = daysPassed;
                const paceEOM = daysPassedInv > 0 ? (totalRevenue / daysPassedInv) * totalDays : 0;
                const forecastLow = paceEOM * 0.93;
                const forecastHigh = paceEOM * 1.07;
                const requiredPerDay =
                  totalTarget > 0 && totalDays - daysPassedInv > 0
                    ? (totalTarget - totalRevenue) / (totalDays - daysPassedInv)
                    : null;
                const growthVsLy =
                  yoyData && yoyData.lyMtdHalalas > 0 && kpis
                    ? (totalRevenue / (yoyData.lyMtdHalalas / 100) - 1) * 100
                    : null;
                return (
                  <div className="min-w-0 space-y-4">
                    <div className="grid min-w-0 grid-cols-12 gap-4">
                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Revenue (MTD)</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fmtSar0(Math.round(totalRevenue * 100))}</p>
                      </div>
                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Growth vs LY</p>
                        <p className="mt-1 text-lg text-slate-600">
                          {growthVsLy != null ? `${(growthVsLy >= 0 ? '+' : '')}${growthVsLy.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Forecast EOM (Low / Base / High)</p>
                        <p className="mt-1 text-sm tabular-nums text-slate-900">
                          {fmtSar0(Math.round(forecastLow * 100))} / {fmtSar0(Math.round(paceEOM * 100))} / {fmtSar0(Math.round(forecastHigh * 100))}
                        </p>
                      </div>
                    </div>
                    <div className="grid min-w-0 grid-cols-12 gap-4">
                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Required/day</p>
                        <p className="mt-1 text-sm tabular-nums text-slate-900">
                          {requiredPerDay != null ? `${fmtSar0(Math.max(0, Math.round(requiredPerDay * 100)))} / day` : '—'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">To hit target from here to month end.</p>
                      </div>
                    </div>
                    <div className="min-w-0 overflow-x-auto">
                      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Branch</th>
                            <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Revenue</th>
                            <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Target</th>
                            <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Ach %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareBoutiques.map((b) => (
                            <tr key={b.boutiqueId} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                              <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{b.name || b.code}</td>
                              <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{Math.round(b.sales).toLocaleString()} SAR</td>
                              <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{Math.round(b.target).toLocaleString()} SAR</td>
                              <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{b.achievementPct != null ? `${b.achievementPct}%` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                      <strong>MIS:</strong> Forecast = pace EOM (run-rate). Required/day = (target − MTD) / days remaining. Ach% = branch revenue vs target.
                    </p>

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Action plan (top 3)</p>
                      <ul className="mt-2 space-y-2">
                        {(() => {
                          const items = [
                            networkAch != null && networkAch < 90 && `Revenue: focus on closing gap to target.`,
                            growthVsLy != null && growthVsLy < 0 && `YoY: growth vs LY ${growthVsLy.toFixed(1)}% — review demand.`,
                            requiredPerDay != null && requiredPerDay > 0 && `Pace: required ${fmtSar0(Math.max(0, Math.round(requiredPerDay * 100)))} / day to hit target.`,
                          ]
                            .filter((t): t is string => Boolean(t))
                            .slice(0, 3);
                          if (items.length === 0) {
                            return <li className="text-sm text-slate-500">No priority actions.</li>;
                          }
                          return items.map((text, i) => (
                            <li key={i} className="flex min-w-0 items-start gap-2 rounded border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700">
                              <span className="shrink-0 font-medium tabular-nums text-slate-500">{i + 1}.</span>
                              <span className="min-w-0 flex-1">{text}</span>
                            </li>
                          ));
                        })()}
                      </ul>
                    </div>
                  </div>
                );
              })()
            )}
          </ExecPanel>
        </section>
        </>
      )}
    </div>
  );
}
