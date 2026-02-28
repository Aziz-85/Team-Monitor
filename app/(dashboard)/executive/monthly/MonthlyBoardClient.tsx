'use client';

import { useEffect, useState } from 'react';

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

export function MonthlyBoardClient() {
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/executive/monthly?month=${month}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then(setData)
      .catch(() => setError('Failed to load monthly report'))
      .finally(() => setLoading(false));
  }, [month]);

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
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-800">
          Monthly Board Report
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-[#E8DFC8] bg-white px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {data.dataScope && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <strong>Data scope:</strong>{' '}
          Boutique: {data.dataScope.boutiqueName ?? data.dataScope.boutiqueId}
          {data.dataScope.boutiqueCode != null && ` (${data.dataScope.boutiqueCode})`}
          {' · '}
          Month: {data.dataScope.monthKey}
          {' · '}
          Sales entries: {data.dataScope.salesEntryCount}
          {' · '}
          Ledger lines: {data.dataScope.ledgerLineCount ?? '—'}
        </div>
      )}

      {/* Boutique Performance Score */}
      <div className="rounded-2xl border-2 border-[#E8DFC8] bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-gray-500">
          Boutique Performance Score
        </h2>
        <p className="text-3xl font-semibold text-[#C6A756]">
          {data.boutiqueScore.score}
          <span className="ml-2 text-lg font-normal text-gray-600">
            ({data.boutiqueScore.classification})
          </span>
        </p>
        {data.boutiqueScore.components && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>Sales: {data.boutiqueScore.components.revenue}</span>
            <span>Tasks: {data.boutiqueScore.components.tasks}</span>
            <span>Schedule: {data.boutiqueScore.components.schedule}</span>
            <span>Zone: {data.boutiqueScore.components.zone}</span>
            <span>Discipline: {data.boutiqueScore.components.discipline}</span>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Sales Intelligence">
          <ul className="space-y-1 text-sm">
            <li>Sales (SAR): <strong>{data.salesIntelligence.revenue.toLocaleString()}</strong></li>
            <li>Target: <strong>{data.salesIntelligence.target.toLocaleString()}</strong></li>
            <li>Achievement: <strong className="text-[#C6A756]">{data.salesIntelligence.achievementPct}%</strong></li>
            <li>Employee targets: {data.salesIntelligence.totalEmployeeTarget}</li>
            <li>Sales entries: {data.salesIntelligence.entryCount}</li>
          </ul>
        </Card>

        <Card title="Workforce Stability">
          <ul className="space-y-1 text-sm">
            <li>Pending leaves: <strong>{data.workforceStability.pendingLeaves}</strong></li>
            <li>Approved leaves (in period): {data.workforceStability.approvedLeavesInPeriod}</li>
            <li>Employees with target: {data.workforceStability.employeeTargetCount}</li>
          </ul>
        </Card>

        <Card title="Operational Discipline">
          <ul className="space-y-1 text-sm">
            <li>Task completions: <strong>{data.operationalDiscipline.taskCompletionsInMonth}</strong></li>
            <li>Schedule edits: {data.operationalDiscipline.scheduleEditsInMonth}</li>
            <li>Zone runs: {data.operationalDiscipline.zoneRunsTotal}</li>
            <li>Zone compliance: <strong className="text-[#C6A756]">{data.operationalDiscipline.zoneCompliancePct}%</strong></li>
          </ul>
        </Card>

        <Card title="Risk Score">
          <p className="text-2xl font-semibold text-[#C6A756]">
            {data.riskScore.score}
          </p>
          <p className="text-sm text-gray-600">{data.riskScore.classification}</p>
        </Card>
      </div>
    </div>
  );
}
