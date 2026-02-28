'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { ExecBadgeStatus } from '@/components/dashboard-ui/ExecBadge';
import { ExecBadge } from '@/components/dashboard-ui/ExecBadge';
import { ExecBullet } from '@/components/dashboard-ui/ExecBullet';
import { ExecDataCell } from '@/components/dashboard-ui/ExecDataCell';
import { ExecInsightCallout } from '@/components/dashboard-ui/ExecInsightCallout';
import { ExecKpiBlock } from '@/components/dashboard-ui/ExecKpiBlock';
import type { ExecViewMode } from '@/components/dashboard-ui/ExecModeToggle';
import { ExecModeToggle } from '@/components/dashboard-ui/ExecModeToggle';
import { ExecPanel } from '@/components/dashboard-ui/ExecPanel';
import { ExecSimpleTable } from '@/components/dashboard-ui/ExecSimpleTable';

function achStatus(pct: number): ExecBadgeStatus {
  if (pct >= 90) return 'ok';
  if (pct >= 75) return 'watch';
  return 'action';
}

function wowStatus(pct: number): ExecBadgeStatus {
  if (pct >= 3) return 'ok';
  if (pct >= -3) return 'watch';
  return 'action';
}

function salesPerStaffStatus(
  salesPerStaff: number,
  otherSalesPerStaff: number
): ExecBadgeStatus {
  const ratio = otherSalesPerStaff > 0 ? salesPerStaff / otherSalesPerStaff : 1;
  const pctLower = (1 - ratio) * 100;
  if (pctLower >= 20) return 'action';
  if (pctLower >= 10) return 'watch';
  return 'ok';
}

function backlogStatus(count: number, avgAgeDays: number): ExecBadgeStatus {
  if (avgAgeDays > 3) return 'action';
  if (count <= 8) return 'ok';
  if (count <= 15) return 'watch';
  return 'action';
}

function paceGapStatus(paceGapPct: number): ExecBadgeStatus {
  if (paceGapPct >= -5) return 'ok';
  if (paceGapPct >= -10) return 'watch';
  return 'action';
}

function yoyStatus(yoyPct: number): ExecBadgeStatus {
  if (yoyPct >= 5) return 'ok';
  if (yoyPct >= -5) return 'watch';
  return 'action';
}

type BoutiqueRow = {
  boutique: string;
  target: number;
  netSales: number;
  achPct: number;
  gap: number;
  wowPct: number;
  salesPerStaff: number;
  compliancePct: number;
  backlog: number;
  avgAgeDays: number;
  txnMTD: number;
  avgTicketMTD: number;
  wowTxnGrowth: number;
  wowAvgTicketGrowth: number;
};

type StaffRow = {
  employee: string;
  netSales: number;
  txnCount: number;
  avgTicket: number;
  contributionPct: number;
  status: ExecBadgeStatus;
};

/** Minimal shape from GET /api/executive/historical-snapshot */
type HistoricalSnapshot = {
  month: string;
  boutiqueId: string;
  daily: { date: string; netSales: number; invoices: number; pieces: number; employees: { empId: string; name: string; netSales: number; invoices: number; pieces: number; achievementPct: number }[] }[];
  totals: { netSales: number; invoices: number; pieces: number };
};

type YoYRow = { boutique: string; boutiqueId?: string; currentMTD: number; sameMonthLY: number; yoyPct: number };

const CURRENT_DAY = 15;
const DAYS_IN_MONTH = 30;
const EXPECTED_PCT = (CURRENT_DAY / DAYS_IN_MONTH) * 100;

const MOCK_A: BoutiqueRow = {
  boutique: 'A',
  target: 950_000,
  netSales: 855_000,
  achPct: 90,
  gap: -95_000,
  wowPct: 4,
  salesPerStaff: 42_750,
  compliancePct: 96,
  backlog: 6,
  avgAgeDays: 2,
  txnMTD: 10_200,
  avgTicketMTD: 84,
  wowTxnGrowth: 2.5,
  wowAvgTicketGrowth: 1.2,
};

const MOCK_B: BoutiqueRow = {
  boutique: 'B',
  target: 2_750_000,
  netSales: 1_980_000,
  achPct: 72,
  gap: -770_000,
  wowPct: -4,
  salesPerStaff: 33_000,
  compliancePct: 92,
  backlog: 18,
  avgAgeDays: 4,
  txnMTD: 36_000,
  avgTicketMTD: 55,
  wowTxnGrowth: -2.1,
  wowAvgTicketGrowth: -1.8,
};

const BOUTIQUES: BoutiqueRow[] = [MOCK_A, MOCK_B];

const STAFF_A: StaffRow[] = [
  { employee: 'Sarah M.', netSales: 380_000, txnCount: 4_200, avgTicket: 90, contributionPct: 44.4, status: 'ok' },
  { employee: 'Layla A.', netSales: 285_000, txnCount: 3_400, avgTicket: 84, contributionPct: 33.3, status: 'ok' },
  { employee: 'Omar F.', netSales: 190_000, txnCount: 2_600, avgTicket: 73, contributionPct: 22.2, status: 'watch' },
];

const STAFF_B: StaffRow[] = [
  { employee: 'Nora K.', netSales: 820_000, txnCount: 14_200, avgTicket: 58, contributionPct: 41.4, status: 'ok' },
  { employee: 'Khalid R.', netSales: 620_000, txnCount: 11_800, avgTicket: 53, contributionPct: 31.3, status: 'watch' },
  { employee: 'Fatima S.', netSales: 540_000, txnCount: 10_000, avgTicket: 54, contributionPct: 27.3, status: 'ok' },
];

const NETWORK_NET_SALES = MOCK_A.netSales + MOCK_B.netSales;
const NETWORK_TARGET = MOCK_A.target + MOCK_B.target;
const NETWORK_ACH_PCT = Math.round((NETWORK_NET_SALES / NETWORK_TARGET) * 100);
const NETWORK_WOW_PCT = 1;
const NETWORK_BACKLOG = MOCK_A.backlog + MOCK_B.backlog;

/** Mock historical (no margin/cost) */
const MOCK_YOY = {
  A: { mtdLastYear: 798_000 },
  B: { mtdLastYear: 2_100_000 },
};

/** Branch profile (context) — mock per boutique */
const MOCK_BRANCH_PROFILE = {
  A: { sizeTier: 'Small' as const, crowdIndex: 'Medium' as const, brandStrength: 'Strong' as const, productDepth: 'High' as const },
  B: { sizeTier: 'Large' as const, crowdIndex: 'High' as const, brandStrength: 'Emerging' as const, productDepth: 'Medium' as const },
};

/** Proxy: return/exchange rate (mock) */
const MOCK_RETURN_RATE = { A: 3.2, B: 4.1 };

function boutiqueScore(row: BoutiqueRow, paceGapPct: number): number {
  const ach = row.achPct / 100;
  const compliance = row.compliancePct / 100;
  const pace = Math.max(0, 1 + paceGapPct / 100);
  const backlogNorm = 1 - Math.min(1, row.backlog / 20);
  return Math.round((0.4 * ach + 0.3 * compliance + 0.2 * pace + 0.1 * backlogNorm) * 100);
}

type ActionItem = { id: string; priority: number; text: string; type: string };

function buildActionQueue(rows: BoutiqueRow[]): ActionItem[] {
  const items: ActionItem[] = [];
  const salesStaffGapPct = (1 - MOCK_B.salesPerStaff / MOCK_A.salesPerStaff) * 100;

  rows.forEach((r) => {
    const expectedPct = EXPECTED_PCT;
    const paceGap = r.achPct - expectedPct;

    if (r.achPct < 75) {
      items.push({
        id: `perf-${r.boutique}`,
        priority: 1,
        type: 'Performance risk',
        text: `Boutique ${r.boutique} Ach% is ${r.achPct}% (below 75%). Gap ${Math.abs(r.gap).toLocaleString()} SAR. Recommendation: Review drivers and capacity.`,
      });
    }
    if (paceGap < -10) {
      items.push({
        id: `pace-${r.boutique}`,
        priority: 2,
        type: 'Pacing issue',
        text: `Boutique ${r.boutique} Pace Gap is ${paceGap.toFixed(1)}% (Ach% ${r.achPct}% vs expected ${expectedPct.toFixed(0)}%). Recommendation: Accelerate to close gap.`,
      });
    }
    if (r.boutique === 'B' && salesStaffGapPct >= 20) {
      items.push({
        id: 'prod-B',
        priority: 3,
        type: 'Productivity issue',
        text: `Boutique B Sales/Staff is ${salesStaffGapPct.toFixed(0)}% below Boutique A. Recommendation: Align processes or capacity.`,
      });
    }
    if (r.avgAgeDays > 3) {
      items.push({
        id: `ops-${r.boutique}`,
        priority: 4,
        type: 'Operational issue',
        text: `Boutique ${r.boutique} backlog avg age is ${r.avgAgeDays}d (threshold 3d). Backlog ${r.backlog}. Recommendation: Prioritize completion.`,
      });
    }
  });

  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((a, i) => ({ ...a, id: `action-${i + 1}` }));
}

function forecastAchStatus(pct: number): ExecBadgeStatus {
  if (pct >= 90) return 'ok';
  if (pct >= 75) return 'watch';
  return 'action';
}

function getMonthLY(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

type StaffRowFromSnapshot = StaffRow & { pieces: number; achievementPct: number };

function aggregateStaffFromSnapshot(snapshot: HistoricalSnapshot): StaffRowFromSnapshot[] {
  const byEmp = new Map<string, { name: string; netSales: number; invoices: number; pieces: number; achievementSum: number; count: number }>();
  for (const d of snapshot.daily) {
    for (const e of d.employees) {
      const key = e.empId || e.name || `row-${d.date}`;
      const cur = byEmp.get(key);
      if (!cur) {
        byEmp.set(key, { name: e.name || e.empId, netSales: e.netSales, invoices: e.invoices, pieces: e.pieces, achievementSum: e.achievementPct, count: 1 });
      } else {
        cur.netSales += e.netSales;
        cur.invoices += e.invoices;
        cur.pieces += e.pieces;
        cur.achievementSum += e.achievementPct;
        cur.count += 1;
      }
    }
  }
  const totalNet = snapshot.totals.netSales || 1;
  return Array.from(byEmp.entries()).map(([, v]) => {
    const avgTicket = v.invoices > 0 ? (v.netSales / 100) / v.invoices : 0;
    const contributionPct = totalNet > 0 ? (v.netSales / totalNet) * 100 : 0;
    const achPct = v.count > 0 ? v.achievementSum / v.count : 0;
    return {
      employee: v.name,
      netSales: v.netSales / 100,
      txnCount: v.invoices,
      pieces: v.pieces,
      avgTicket: Math.round(avgTicket * 100) / 100,
      contributionPct,
      status: achStatus(achPct),
      achievementPct: achPct,
    };
  });
}

export function NetworkExecutiveClient() {
  const [viewMode, setViewMode] = useState<ExecViewMode>('Operator');
  const [maxShiftPct, setMaxShiftPct] = useState(10);
  const [lockIfDaysLeftLessThan, setLockIfDaysLeftLessThan] = useState(7);
  const [historicalMonth, setHistoricalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [boutiqueList, setBoutiqueList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [snapshotData, setSnapshotData] = useState<Record<string, { current: HistoricalSnapshot | null; ly: HistoricalSnapshot | null }>>({});

  const fetchSnapshots = useCallback(async (month: string) => {
    const res = await fetch('/api/me/boutiques');
    if (!res.ok) return;
    const data = await res.json();
    const boutiques: { id: string; code: string; name: string }[] = data.boutiques ?? [];
    setBoutiqueList(boutiques);
    const ly = getMonthLY(month);
    const next: Record<string, { current: HistoricalSnapshot | null; ly: HistoricalSnapshot | null }> = {};
    for (const b of boutiques) {
      const [curRes, lyRes] = await Promise.all([
        fetch(`/api/executive/historical-snapshot?boutiqueId=${encodeURIComponent(b.id)}&month=${encodeURIComponent(month)}`),
        fetch(`/api/executive/historical-snapshot?boutiqueId=${encodeURIComponent(b.id)}&month=${encodeURIComponent(ly)}`),
      ]);
      next[b.id] = {
        current: curRes.ok ? await curRes.json() : null,
        ly: lyRes.ok ? await lyRes.json() : null,
      };
    }
    setSnapshotData(next);
  }, []);

  useEffect(() => {
    fetchSnapshots(historicalMonth);
  }, [historicalMonth, fetchSnapshots]);

  const salesPerStaffStatusA = salesPerStaffStatus(MOCK_A.salesPerStaff, MOCK_B.salesPerStaff);
  const salesPerStaffStatusB = salesPerStaffStatus(MOCK_B.salesPerStaff, MOCK_A.salesPerStaff);

  const paceGapNetwork = NETWORK_ACH_PCT - EXPECTED_PCT;
  const scoreA = boutiqueScore(MOCK_A, MOCK_A.achPct - EXPECTED_PCT);
  const scoreB = boutiqueScore(MOCK_B, MOCK_B.achPct - EXPECTED_PCT);
  const leading = scoreA >= scoreB ? 'A' : 'B';
  const priority = scoreA >= scoreB ? 'B' : 'A';
  const autoActions = useMemo(() => buildActionQueue(BOUTIQUES), []);
  const investorActions = autoActions.slice(0, 3);

  const forecastRows = useMemo(() => {
    const runRateA = (MOCK_A.netSales / CURRENT_DAY) * DAYS_IN_MONTH;
    const runRateB = (MOCK_B.netSales / CURRENT_DAY) * DAYS_IN_MONTH;
    const runRateNet = (NETWORK_NET_SALES / CURRENT_DAY) * DAYS_IN_MONTH;
    return [
      {
        boutique: 'A',
        target: MOCK_A.target,
        base: runRateA,
        low: runRateA * 0.95,
        high: runRateA * 1.05,
        forecastAchPct: (runRateA / MOCK_A.target) * 100,
      },
      {
        boutique: 'B',
        target: MOCK_B.target,
        base: runRateB,
        low: runRateB * 0.95,
        high: runRateB * 1.05,
        forecastAchPct: (runRateB / MOCK_B.target) * 100,
      },
      {
        boutique: 'Network',
        target: NETWORK_TARGET,
        base: runRateNet,
        low: runRateNet * 0.95,
        high: runRateNet * 1.05,
        forecastAchPct: (runRateNet / NETWORK_TARGET) * 100,
      },
    ];
  }, []);

  const daysLeft = DAYS_IN_MONTH - CURRENT_DAY;
  const rebalancingSuggestion = useMemo(() => {
    const actionRow = BOUTIQUES.find((r) => achStatus(r.achPct) === 'action');
    const okRow = BOUTIQUES.find((r) => achStatus(r.achPct) === 'ok');
    if (!actionRow || !okRow || daysLeft < lockIfDaysLeftLessThan) return null;
    const targetNeededFor75 = actionRow.netSales / 0.75;
    const gapTo75 = actionRow.target - targetNeededFor75;
    if (gapTo75 <= 0) return null;
    const maxShift = (okRow.target * maxShiftPct) / 100;
    const shift = Math.min(maxShift, gapTo75);
    return {
      from: okRow.boutique,
      to: actionRow.boutique,
      amount: shift,
      newTargetOk: okRow.target + shift,
      newTargetAction: actionRow.target - shift,
      reasoning: [
        `PaceGap: Boutique ${actionRow.boutique} below 75% Ach%; Boutique ${okRow.boutique} on track.`,
        `Forecast Ach%: ${(forecastRows.find((r) => r.boutique === actionRow.boutique)?.forecastAchPct ?? 0).toFixed(0)}% at risk.`,
        `Sales/Staff: Shift supports at-risk branch without exceeding ${maxShiftPct}% of donor target.`,
      ],
    };
  }, [maxShiftPct, daysLeft, lockIfDaysLeftLessThan, forecastRows]);

  const yoyRowsFromSnapshots = useMemo((): YoYRow[] => {
    const rows: YoYRow[] = [];
    let networkCurrent = 0;
    let networkLY = 0;
    for (const b of boutiqueList) {
      const s = snapshotData[b.id];
      if (!s?.current?.totals || !s?.ly?.totals) continue;
      const currentMTD = s.current.totals.netSales / 100;
      const sameMonthLY = s.ly.totals.netSales / 100;
      const yoyPct = sameMonthLY > 0 ? (currentMTD / sameMonthLY - 1) * 100 : 0;
      rows.push({ boutique: b.name || b.code, boutiqueId: b.id, currentMTD, sameMonthLY, yoyPct });
      networkCurrent += currentMTD;
      networkLY += sameMonthLY;
    }
    if (rows.length > 0 && networkLY > 0) {
      rows.push({ boutique: 'Network', currentMTD: networkCurrent, sameMonthLY: networkLY, yoyPct: (networkCurrent / networkLY - 1) * 100 });
    }
    return rows;
  }, [boutiqueList, snapshotData]);

  const yoyRowsForPanel = useMemo(() => {
    if (yoyRowsFromSnapshots.length > 0) return yoyRowsFromSnapshots;
    const lyNet = MOCK_YOY.A.mtdLastYear + MOCK_YOY.B.mtdLastYear;
    return [
      { boutique: 'A', currentMTD: MOCK_A.netSales, sameMonthLY: MOCK_YOY.A.mtdLastYear, yoyPct: (MOCK_A.netSales / MOCK_YOY.A.mtdLastYear - 1) * 100 },
      { boutique: 'B', currentMTD: MOCK_B.netSales, sameMonthLY: MOCK_YOY.B.mtdLastYear, yoyPct: (MOCK_B.netSales / MOCK_YOY.B.mtdLastYear - 1) * 100 },
      { boutique: 'Network', currentMTD: NETWORK_NET_SALES, sameMonthLY: lyNet, yoyPct: (NETWORK_NET_SALES / lyNet - 1) * 100 },
    ];
  }, [yoyRowsFromSnapshots]);

  const rebalancingReasoning = useMemo(() => {
    if (!rebalancingSuggestion) return [];
    const actionRow = BOUTIQUES.find((r) => r.boutique === rebalancingSuggestion.to);
    const fr = forecastRows.find((r) => r.boutique === actionRow?.boutique);
    const paceGap = actionRow ? actionRow.achPct - EXPECTED_PCT : 0;
    const salesStaffGap = actionRow && actionRow.boutique === 'B' ? (1 - MOCK_B.salesPerStaff / MOCK_A.salesPerStaff) * 100 : 0;
    const yoyPct = actionRow ? (actionRow.boutique === 'A' ? (MOCK_A.netSales / MOCK_YOY.A.mtdLastYear - 1) * 100 : (MOCK_B.netSales / MOCK_YOY.B.mtdLastYear - 1) * 100) : 0;
    return [
      `ForecastAch%: Boutique ${rebalancingSuggestion.to} at ${fr?.forecastAchPct.toFixed(0) ?? 0}% vs target.`,
      `PaceGap: ${paceGap.toFixed(1)}% (Ach% vs expected ${EXPECTED_PCT.toFixed(0)}%).`,
      actionRow?.boutique === 'B' ? `Sales/Staff relative gap: ${salesStaffGap.toFixed(0)}% below Boutique A.` : null,
      `YoY trend: ${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}% vs same month LY.`,
    ].filter(Boolean) as string[];
  }, [rebalancingSuggestion, forecastRows]);

  const kpiSection = (
    <section className="grid min-w-0 grid-cols-12 gap-4">
      <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
        <ExecKpiBlock
          title="Network Net Sales (MTD)"
          actual={`${NETWORK_NET_SALES.toLocaleString()} SAR`}
          target={`${NETWORK_TARGET.toLocaleString()} SAR`}
          variance={`${(NETWORK_NET_SALES - NETWORK_TARGET).toLocaleString()} SAR`}
          variancePct={`${Math.round(((NETWORK_NET_SALES - NETWORK_TARGET) / NETWORK_TARGET) * 100)}%`}
          compareLabel="WoW"
          compareValue="+1% vs prev 7d"
          status={NETWORK_ACH_PCT >= 90 ? 'ok' : NETWORK_ACH_PCT >= 75 ? 'watch' : 'action'}
          footnote="Definition: Sum of netAmount across all boutiques. Period: MTD. Comparator: last 7d vs prev 7d."
        />
      </div>
      <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
        <ExecKpiBlock
          title="Network Achievement % (MTD)"
          actual={`${NETWORK_ACH_PCT}%`}
          target="100%"
          variance={`${NETWORK_ACH_PCT - 100} pp`}
          compareLabel="WoW"
          compareValue="+1.2 pp vs prev 7d"
          status={achStatus(NETWORK_ACH_PCT)}
          footnote="Definition: Ach% = Net Sales / Monthly Target. Period: MTD. Comparator: same period prior week."
        />
      </div>
      <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
        <ExecKpiBlock
          title="Network WoW Growth"
          actual={`${NETWORK_WOW_PCT >= 0 ? '+' : ''}${NETWORK_WOW_PCT}%`}
          target="≥+3%"
          variance={`${NETWORK_WOW_PCT >= 0 ? '+' : ''}${NETWORK_WOW_PCT} pp`}
          compareLabel="Prev"
          compareValue="prev 7d baseline"
          status={wowStatus(NETWORK_WOW_PCT)}
          footnote="Definition: WoW = (last7d / prev7d) − 1. Period: rolling 7d. Comparator: prev 7d."
        />
      </div>
      <div className="col-span-12 min-w-0 md:col-span-6 xl:col-span-3">
        <ExecKpiBlock
          title="Network Task Backlog"
          actual={String(NETWORK_BACKLOG)}
          target="≤16"
          variance="—"
          compareLabel="Aging"
          compareValue="max 4d avg"
          status={NETWORK_BACKLOG <= 8 ? 'ok' : NETWORK_BACKLOG <= 15 ? 'watch' : 'action'}
          footnote="Definition: Sum of open tasks. ok ≤8, watch 9–15, action ≥16 or avgAge >3d."
        />
      </div>
    </section>
  );

  const branchComparisonShort = (
    <ExecPanel title="Branch comparison" subtitle="Summary">
      <ExecSimpleTable
        columns={[
          { key: 'boutique', label: 'Boutique', align: 'left' },
          { key: 'netSales', label: 'Net Sales', align: 'right' },
          { key: 'achPct', label: 'Ach%', align: 'right' },
          { key: 'gap', label: 'Gap', align: 'right' },
        ]}
      >
        {BOUTIQUES.map((r) => (
          <tr key={r.boutique} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
            <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">Boutique {r.boutique}</td>
            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.netSales.toLocaleString()} SAR</td>
            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.achPct}%</td>
            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.gap >= 0 ? '+' : ''}{r.gap.toLocaleString()} SAR</td>
          </tr>
        ))}
      </ExecSimpleTable>
    </ExecPanel>
  );

  const forecastSection = (
    <ExecPanel title="Forecast (3 scenarios)" subtitle="RunRate = (MTD / dayOfMonth) × daysInMonth; Low = Base×0.95, High = Base×1.05; forecast ach% vs target">
      <div className="min-w-0 overflow-hidden">
        <table className="w-full min-w-0 table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
              <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Base Forecast</th>
              <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Low</th>
              <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">High</th>
              <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Forecast Ach%</th>
              <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Risk note</th>
            </tr>
          </thead>
          <tbody>
            {forecastRows.map((r) => (
              <tr key={r.boutique} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{r.boutique}</td>
                <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{Math.round(r.base).toLocaleString()} SAR</td>
                <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{Math.round(r.low).toLocaleString()} SAR</td>
                <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{Math.round(r.high).toLocaleString()} SAR</td>
                <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.forecastAchPct.toFixed(1)}%</td>
                <td className="max-w-0 py-3 px-3 truncate">
                  <ExecBadge status={forecastAchStatus(r.forecastAchPct)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
        RunRateForecast = (MTD Sales / dayOfMonth) × daysInMonth. Base = RunRate; Low = Base×0.95; High = Base×1.05. Forecast Ach% = Base / MonthlyTarget. ok ≥90%, watch 75–89%, action &lt;75%.
      </p>
    </ExecPanel>
  );

  const actionListSection = (actions: ActionItem[], title: string, subtitle: string) => (
    <ExecPanel title={title} subtitle={subtitle}>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li
            key={a.id}
            className="flex min-w-0 flex-wrap items-start gap-2 rounded border border-slate-200 bg-white py-2 px-3 text-sm"
          >
            <ExecBadge status="action" label={a.type} />
            <span className="min-w-0 flex-1 text-slate-900">{a.text}</span>
          </li>
        ))}
      </ul>
      {actions.length === 0 && (
        <p className="text-sm text-slate-500">No actions from rules.</p>
      )}
    </ExecPanel>
  );

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Network Executive Overview</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {boutiqueList.length > 0 ? `${boutiqueList.length} boutiques` : '2 boutiques'} · MTD · {viewMode === 'Investor' ? 'Board-ready' : 'Decision intelligence'}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Historical month</span>
            <input
              type="text"
              value={historicalMonth}
              onChange={(e) => setHistoricalMonth(e.target.value)}
              placeholder="YYYY-MM"
              className="w-28 min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
              dir="ltr"
            />
          </label>
          <ExecModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {kpiSection}

      {viewMode === 'Investor' && (
        <>
          {branchComparisonShort}
          {forecastSection}
          {actionListSection(investorActions, 'Action Plan', 'Top 3 priorities')}
        </>
      )}

      {viewMode === 'Operator' && (
        <>
          <section className="min-w-0">
            <ExecPanel title="Pace Analysis" subtitle="Expected progress vs actual achievement">
              <div className="grid min-w-0 grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Ach%</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{NETWORK_ACH_PCT}%</p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Expected Progress %</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{EXPECTED_PCT.toFixed(0)}%</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Day {CURRENT_DAY} of {DAYS_IN_MONTH}</p>
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Pace Gap %</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-slate-900">
                      {paceGapNetwork >= 0 ? '+' : ''}{paceGapNetwork.toFixed(1)}%
                    </span>
                    <ExecBadge status={paceGapStatus(paceGapNetwork)} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Ach% − Expected%</p>
                </div>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                Expected% = (currentDay / daysInMonth) × 100. Pace Gap = Ach% − Expected%. ok ≥−5%, watch −10% to −5%, action &lt;−10%.
              </p>
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Branch Profile (context)" subtitle="Structural context per boutique — no P&L">
              <div className="flex min-w-0 flex-wrap gap-4">
                {BOUTIQUES.map((r) => {
                  const profile = MOCK_BRANCH_PROFILE[r.boutique as 'A' | 'B'];
                  return (
                    <div key={r.boutique} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Boutique {r.boutique}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{profile.sizeTier}</span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{profile.crowdIndex}</span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{profile.brandStrength}</span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{profile.productDepth}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Historical Sales (YoY)" subtitle={`${historicalMonth} vs same month last year · YoY % = (Current MTD / Same Month LY) − 1`}>
              <div className="min-w-0 overflow-hidden">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Current MTD</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Same Month LY</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">YoY %</th>
                      <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yoyRowsForPanel.map((r) => (
                      <tr key={r.boutique + (r.boutiqueId ?? '')} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                        <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{r.boutique}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.currentMTD.toLocaleString()} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.sameMonthLY.toLocaleString()} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{(r.yoyPct >= 0 ? '+' : '') + r.yoyPct.toFixed(1)}%</td>
                        <td className="max-w-0 py-3 px-3 truncate">
                          <ExecBadge status={yoyStatus(r.yoyPct)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                YoY % = (Current MTD / Same Month LY) − 1. ok ≥+5%, watch −5% to +5%, action &lt;−5% (muted, no red).
              </p>
            </ExecPanel>
          </section>

          {yoyRowsFromSnapshots.length > 0 && (
            <section className="min-w-0">
              <ExecPanel title="Proxy metrics (from snapshot)" subtitle="AvgTicket = netSales/invoices (SAR); UPT = pieces/invoices; AIV = netSales/pieces (SAR)">
                <div className="min-w-0 overflow-hidden">
                  <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Avg Ticket (SAR)</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">UPT</th>
                        <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">AIV (SAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boutiqueList.map((b) => {
                        const s = snapshotData[b.id]?.current;
                        if (!s?.totals) return null;
                        const t = s.totals;
                        const avgTicket = t.invoices > 0 ? (t.netSales / 100) / t.invoices : 0;
                        const upt = t.invoices > 0 ? t.pieces / t.invoices : 0;
                        const aiv = t.pieces > 0 ? (t.netSales / 100) / t.pieces : 0;
                        return (
                          <tr key={b.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                            <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{b.name || b.code}</td>
                            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{avgTicket.toFixed(2)}</td>
                            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{upt.toFixed(2)}</td>
                            <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{aiv.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ExecPanel>
            </section>
          )}

          <section className="min-w-0">
            <ExecPanel title="Proxy Profitability (quality & efficiency)" subtitle="No margin/cost — proxy metrics with WoW comparator">
              <div className="min-w-0 overflow-hidden">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Txn MTD</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">WoW</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Avg Ticket</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">WoW</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Sales/Staff</th>
                      <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOUTIQUES.map((r) => (
                      <tr key={r.boutique} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                        <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">Boutique {r.boutique}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.txnMTD.toLocaleString()}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right">
                          <span className="tabular-nums text-slate-600">{(r.wowTxnGrowth >= 0 ? '+' : '') + r.wowTxnGrowth}%</span>
                          <span className="ms-1 inline-block"><ExecBadge status={wowStatus(r.wowTxnGrowth)} /></span>
                        </td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.avgTicketMTD} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right">
                          <span className="tabular-nums text-slate-600">{(r.wowAvgTicketGrowth >= 0 ? '+' : '') + r.wowAvgTicketGrowth}%</span>
                          <span className="ms-1 inline-block"><ExecBadge status={wowStatus(r.wowAvgTicketGrowth)} /></span>
                        </td>
                        <td className="max-w-0 py-3 px-3 truncate text-right">
                          <span className="tabular-nums text-slate-900">{r.salesPerStaff.toLocaleString()}</span>
                          <span className="ms-1 inline-block"><ExecBadge status={r.boutique === 'A' ? salesPerStaffStatusA : salesPerStaffStatusB} /></span>
                        </td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{MOCK_RETURN_RATE[r.boutique as 'A' | 'B']}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                Return % = returns/exchanges vs gross (mock). WoW = week-over-week growth. Status: ok/watch/action (muted).
              </p>
            </ExecPanel>
          </section>

          {forecastSection}

          <section className="min-w-0">
            <ExecPanel title="Target Rebalancing (scenario)" subtitle="Max shift 10%; no rebalance if days left &lt; 7. Uses ForecastAch%, PaceGap, Sales/Staff, YoY.">
              <div className="grid min-w-0 grid-cols-12 gap-4">
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Max shift %</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={maxShiftPct}
                    onChange={(e) => setMaxShiftPct(Number(e.target.value) || 10)}
                    className="mt-1 w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
                  />
                </div>
                <div className="col-span-12 min-w-0 md:col-span-4">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Lock if days left &lt;</label>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={lockIfDaysLeftLessThan}
                    onChange={(e) => setLockIfDaysLeftLessThan(Number(e.target.value) || 7)}
                    className="mt-1 w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
                  />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Guardrails: max shift 10%; no rebalance when days left &lt; 7. Logic: ForecastAch%, PaceGap, Sales/Staff relative gap, YoY trend.</p>

              {rebalancingSuggestion ? (
                <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-xs font-medium text-slate-700">Suggested target adjustments</p>
                  <div className="grid min-w-0 grid-cols-12 gap-2 text-sm">
                    <div className="col-span-12 min-w-0 md:col-span-4">
                      <span className="text-slate-500">Current targets:</span> A: {MOCK_A.target.toLocaleString()} SAR, B: {MOCK_B.target.toLocaleString()} SAR
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-4">
                      <span className="text-slate-500">Suggested:</span> Boutique {rebalancingSuggestion.from}: {Math.round(rebalancingSuggestion.newTargetOk).toLocaleString()} SAR; Boutique {rebalancingSuggestion.to}: {Math.round(rebalancingSuggestion.newTargetAction).toLocaleString()} SAR
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-4">
                      <span className="text-slate-500">Delta:</span> {Math.round(rebalancingSuggestion.amount).toLocaleString()} SAR shift
                    </div>
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Reasoning</p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-600">
                    {rebalancingReasoning.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No rebalance (both ok, or days left &lt; {lockIfDaysLeftLessThan}, or gap to 75% covered).
                </p>
              )}
            </ExecPanel>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Revenue Decomposition" subtitle="Transactions and avg ticket by boutique">
              <div className="min-w-0 overflow-hidden">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="py-3 px-3 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Txn MTD</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Avg Ticket MTD</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">WoW Txn Growth</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">WoW Avg Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOUTIQUES.map((r) => (
                      <tr key={r.boutique} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                        <td className="max-w-0 py-3 px-3 font-medium text-slate-900">Boutique {r.boutique}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.txnMTD.toLocaleString()}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.avgTicketMTD} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.wowTxnGrowth >= 0 ? '+' : ''}{r.wowTxnGrowth}%</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{r.wowAvgTicketGrowth >= 0 ? '+' : ''}{r.wowAvgTicketGrowth}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ExecPanel>
          </section>

          <section className="grid min-w-0 grid-cols-12 gap-4">
            <div className="col-span-12 min-w-0 md:col-span-6">
              <ExecPanel title="Boutique Score" subtitle="Weighted: Ach%, Compliance, Pace, Backlog">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-emerald-50/50 px-3 py-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Leading branch</span>
                    <span className="font-semibold text-slate-900">Boutique {leading}</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{leading === 'A' ? scoreA : scoreB}/100</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-amber-50/30 px-3 py-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Priority branch</span>
                    <span className="font-semibold text-slate-900">Boutique {priority}</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{priority === 'A' ? scoreA : scoreB}/100</span>
                  </div>
                </div>
                <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                  Score = 0.4×Ach% + 0.3×Compliance% + 0.2×Pace + 0.1×Backlog norm (0–100).
                </p>
              </ExecPanel>
            </div>
          </section>

          <section className="min-w-0">
            <ExecPanel title="Boutique comparison" subtitle="Target, net sales, Ach%, gap, WoW%, sales/staff, compliance, backlog">
              <div className="min-w-0 overflow-hidden">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '6%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="py-3 px-3 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Boutique</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Target</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Net Sales</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Ach%</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Gap</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">WoW%</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Sales/Staff</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Compliance%</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Backlog</th>
                      <th className="py-3 px-3 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Avg Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOUTIQUES.map((row) => (
                      <tr
                        key={row.boutique}
                        className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="max-w-0 py-3 px-3 text-left font-medium text-slate-900">
                          <span className="min-w-0 truncate">Boutique {row.boutique}</span>
                        </td>
                        <ExecDataCell value={`${row.target.toLocaleString()} SAR`} align="right" />
                        <ExecDataCell value={`${row.netSales.toLocaleString()} SAR`} align="right" />
                        <ExecDataCell
                          value={`${row.achPct}%`}
                          status={achStatus(row.achPct)}
                          align="right"
                          bullet={
                            <ExecBullet
                              value={row.achPct}
                              target={100}
                              max={100}
                              thresholds={{ good: 90, watch: 75 }}
                              height={12}
                            />
                          }
                        />
                        <ExecDataCell value={`${row.gap >= 0 ? '+' : ''}${row.gap.toLocaleString()} SAR`} align="right" />
                        <ExecDataCell value={`${row.wowPct >= 0 ? '+' : ''}${row.wowPct}%`} status={wowStatus(row.wowPct)} align="right" />
                        <ExecDataCell
                          value={row.salesPerStaff.toLocaleString()}
                          status={row.boutique === 'A' ? salesPerStaffStatusA : salesPerStaffStatusB}
                          align="right"
                        />
                        <ExecDataCell value={`${row.compliancePct}%`} align="right" />
                        <ExecDataCell value={String(row.backlog)} status={backlogStatus(row.backlog, row.avgAgeDays)} align="right" />
                        <ExecDataCell value={`${row.avgAgeDays}d`} status={row.avgAgeDays > 3 ? 'action' : 'neutral'} align="right" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ExecPanel>
          </section>

          {actionListSection(autoActions, 'Executive Action List', 'Top 5 issues (auto from rules)')}
        </>
      )}

      {boutiqueList.map((b) => {
        const s = snapshotData[b.id]?.current;
        if (!s) return null;
        const staffRows = aggregateStaffFromSnapshot(s);
        if (staffRows.length === 0) return null;
        if (viewMode === 'Investor') {
          const above = staffRows.filter((r) => r.status === 'ok').length;
          const below = staffRows.filter((r) => r.status === 'action').length;
          const watch = staffRows.filter((r) => r.status === 'watch').length;
          return (
            <ExecPanel key={b.id} title={`Staff — ${b.name || b.code}`} subtitle="Investor view: aggregated only">
              <p className="text-sm text-slate-600">
                Above target: {above} · Watch: {watch} · Below target: {below}
              </p>
            </ExecPanel>
          );
        }
        const top = staffRows.reduce((a, b) => (a.netSales >= b.netSales ? a : b));
        const lowestAvgTicket = staffRows.reduce((a, b) => (a.avgTicket <= b.avgTicket ? a : b));
        const opportunity = lowestAvgTicket;
        return (
          <ExecPanel key={b.id} title={`Staff Performance — ${b.name || b.code}`} subtitle="Operator view (from snapshot)">
            <div className="min-w-0 overflow-hidden">
              <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="max-w-0 py-3 px-3 truncate text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Employee</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Net Sales</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Invoices</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Pieces</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">AvgTicket</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">UPT</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Contribution%</th>
                    <th className="max-w-0 py-3 px-3 truncate text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Achievement%</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((srow) => {
                    const upt = srow.txnCount > 0 ? srow.pieces / srow.txnCount : 0;
                    return (
                      <tr key={srow.employee} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                        <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{srow.employee}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{srow.netSales.toLocaleString()} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{srow.txnCount}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{srow.pieces}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{srow.avgTicket} SAR</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{upt.toFixed(2)}</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{srow.contributionPct.toFixed(1)}%</td>
                        <td className="max-w-0 py-3 px-3 truncate text-right">
                          <span className="tabular-nums text-slate-900">{srow.achievementPct.toFixed(1)}%</span>
                          <span className="ms-1 inline-block"><ExecBadge status={srow.status} /></span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <ExecInsightCallout
                title="Insights"
                items={[
                  { label: 'Top contributor', value: `${top.employee} (${top.netSales.toLocaleString()} SAR, ${top.contributionPct.toFixed(1)}%)` },
                  { label: 'Opportunity', value: `${opportunity.employee} — avg ticket ${opportunity.avgTicket} SAR; focus on basket size or volume.` },
                ]}
              />
            </div>
          </ExecPanel>
        );
      })}
      {boutiqueList.every((b) => !snapshotData[b.id]?.current) && viewMode === 'Operator' && [
        { boutique: 'A', staff: STAFF_A, totalSales: MOCK_A.netSales },
        { boutique: 'B', staff: STAFF_B, totalSales: MOCK_B.netSales },
      ].map(({ boutique, staff }) => {
        const top = staff.reduce((a, b) => (a.netSales >= b.netSales ? a : b));
        const lowestAvgTicket = staff.reduce((a, b) => (a.avgTicket <= b.avgTicket ? a : b));
        const lowestTxn = staff.reduce((a, b) => (a.txnCount <= b.txnCount ? a : b));
        const opportunity = lowestAvgTicket.avgTicket <= lowestTxn.avgTicket ? lowestAvgTicket : lowestTxn;
        return (
          <ExecPanel key={boutique} title={`Staff Performance — Boutique ${boutique}`} subtitle="Operator view (mock)">
            <ExecSimpleTable
              columns={[
                { key: 'employee', label: 'Employee', align: 'left' },
                { key: 'netSales', label: 'Net Sales', align: 'right' },
                { key: 'txnCount', label: 'Txn Count', align: 'right' },
                { key: 'avgTicket', label: 'Avg Ticket', align: 'right' },
                { key: 'contributionPct', label: 'Contribution%', align: 'right' },
              ]}
            >
              {staff.map((s) => (
                <tr key={s.employee} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                  <td className="max-w-0 py-3 px-3 truncate font-medium text-slate-900">{s.employee}</td>
                  <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{s.netSales.toLocaleString()} SAR</td>
                  <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{s.txnCount.toLocaleString()}</td>
                  <td className="max-w-0 py-3 px-3 truncate text-right tabular-nums text-slate-900">{s.avgTicket} SAR</td>
                  <td className="max-w-0 py-3 px-3 truncate text-right">
                    <span className="tabular-nums text-slate-900">{s.contributionPct.toFixed(1)}%</span>
                    {s.status !== 'ok' && <span className="ms-1 inline-block"><ExecBadge status={s.status} /></span>}
                  </td>
                </tr>
              ))}
            </ExecSimpleTable>
            <div className="mt-3">
              <ExecInsightCallout
                title="Insights"
                items={[
                  { label: 'Top contributor', value: `${top.employee} (${top.netSales.toLocaleString()} SAR, ${top.contributionPct.toFixed(1)}%)` },
                  { label: 'Biggest opportunity', value: `${opportunity.employee} — lower avg ticket (${opportunity.avgTicket} SAR) or txn count; focus on basket size or volume.` },
                  { label: 'Coaching suggestion', value: 'Review product mix and upsell with team; align on daily targets.' },
                ]}
              />
            </div>
          </ExecPanel>
        );
      })}

      <footer className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Definitions & formulas</h3>
        <ul className="mt-2 space-y-1 text-[10px] text-slate-600">
          <li><strong>Net Sales</strong> = SUM(netAmount)</li>
          <li><strong>Ach%</strong> = Net Sales / Monthly Target</li>
          <li><strong>WoW</strong> = (last7d / prev7d) − 1</li>
          <li><strong>Sales/Staff</strong> = Net Sales / Active Staff</li>
          <li><strong>Expected Progress %</strong> = (currentDay / daysInMonth) × 100</li>
          <li><strong>Pace Gap %</strong> = Ach% − Expected%</li>
          <li><strong>Score</strong> = 0.4×Ach% + 0.3×Compliance% + 0.2×Pace + 0.1×Backlog norm</li>
          <li><strong>RunRateForecast</strong> = (MTD / dayOfMonth) × daysInMonth; Low = Base×0.95, High = Base×1.05; Forecast Ach% = Base / Target</li>
          <li><strong>YoY %</strong> = (Current MTD / Same Month LY) − 1; ok ≥+5%, watch −5% to +5%, action &lt;−5%</li>
        </ul>
      </footer>
    </div>
  );
}
