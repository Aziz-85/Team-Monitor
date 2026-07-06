'use client';

import type { WorkforcePlan } from '@/lib/schedule/resourcePlanner';

type Props = {
  plan: WorkforcePlan;
  formatDayLabel?: (date: string) => string;
  t: (key: string) => string;
};

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'critical' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'critical'
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-border bg-surface-subtle text-foreground';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

export function WorkforcePlanningPanel({ plan, formatDayLabel, t }: Props) {
  const b = plan.workforceBudget;
  const compensationOwed = plan.compensationLedger.reduce(
    (sum, e) => sum + e.compensationOwedHours,
    0
  );

  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-teal-950">
          {tr('schedule.v3.workforce.title', 'Workforce Planning')}
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-teal-900/70">
          {tr('schedule.v3.workforce.subtitle', 'Resource strategy · before solve')}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={tr('schedule.v3.workforce.totalAvailable', 'Total Available Hours')}
          value={`${b.totalAvailableHours}h`}
          tone="neutral"
        />
        <StatCard
          label={tr('schedule.v3.workforce.required', 'Required Hours')}
          value={`${b.totalRequiredHours}h`}
          tone="neutral"
        />
        <StatCard
          label={tr('schedule.v3.workforce.shortage', 'Shortage')}
          value={`${b.shortageHours}h`}
          tone={b.shortageHours > 0 ? 'critical' : 'good'}
        />
        <StatCard
          label={tr('schedule.v3.workforce.bridgeRequired', 'Bridge Required')}
          value={String(b.bridgeRequiredDays)}
          tone={b.bridgeRequiredDays > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label={tr('schedule.v3.workforce.overtimeRequired', 'Overtime Required')}
          value={`${b.overtimeRequiredHours}h`}
          tone={b.overtimeRequiredHours > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label={tr('schedule.v3.workforce.compensationOwed', 'Compensation Owed')}
          value={`${Math.round(compensationOwed * 10) / 10}h`}
          tone={compensationOwed > 0 ? 'warn' : 'good'}
        />
      </div>

      <div className="mt-3 rounded-lg border border-teal-200/60 bg-white/70 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-900/70">
          {tr('schedule.v3.workforce.plannerDecision', 'Planner Decision')}
        </p>
        <p className="mt-0.5 text-sm text-foreground">{plan.plannerDecision}</p>
      </div>

      {(plan.bridgeAssignments.length > 0 || plan.overtimeAssignments.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {plan.bridgeAssignments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-teal-950">
                {tr('schedule.v3.workforce.bridgeShifts', 'Bridge shifts')}
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {plan.bridgeAssignments.map((br) => (
                  <li key={br.date} className="rounded border border-teal-200/50 bg-white/60 px-2 py-1">
                    <span className="font-medium">
                      {formatDayLabel ? formatDayLabel(br.date) : br.date}
                    </span>
                    {br.employeeName ? ` · ${br.employeeName}` : ''}
                    {br.amPeriod && br.pmPeriod && (
                      <span className="ms-1 font-mono text-[11px] text-muted">
                        {br.amPeriod.startTime}–{br.amPeriod.endTime} / {br.pmPeriod.startTime}–
                        {br.pmPeriod.endTime}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.overtimeAssignments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-teal-950">
                {tr('schedule.v3.workforce.overtimeShifts', 'Overtime')}
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {plan.overtimeAssignments.map((o) => (
                  <li
                    key={`${o.date}-${o.employeeId}`}
                    className="rounded border border-amber-200/50 bg-white/60 px-2 py-1"
                  >
                    <span className="font-medium">
                      {formatDayLabel ? formatDayLabel(o.date) : o.date}
                    </span>
                    {o.employeeName ? ` · ${o.employeeName}` : ''}
                    <span className="ms-1 font-mono text-[11px] text-muted">
                      {o.hours}h ({o.startTime}–{o.endTime})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {plan.recommendations.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-teal-950">
            {tr('schedule.v3.workforce.recommendations', 'Planner recommendations')}
          </p>
          <ol className="mt-1 space-y-1.5">
            {plan.recommendations.slice(0, 4).map((rec, i) => (
              <li
                key={`${rec.type}-${i}`}
                className="rounded-lg border border-teal-200/50 bg-white/60 px-3 py-2 text-xs"
              >
                <p className="font-semibold text-foreground">
                  #{i + 1} · {rec.title}
                </p>
                <p className="mt-0.5 text-muted">{rec.reason}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-medium uppercase tracking-wide text-teal-900/70">
                  <span>{rec.impact} impact</span>
                  {rec.hoursSaved > 0 && <span>~{rec.hoursSaved}h saved</span>}
                  {rec.coverageGained > 0 && <span>+{rec.coverageGained} coverage</span>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-teal-900">
          {tr('schedule.v3.workforce.dailyBreakdown', 'Daily workload & compensation ledger')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pe-2 font-medium">{tr('schedule.day', 'Day')}</th>
                <th className="py-1 pe-2 font-medium">
                  {tr('schedule.v3.workforce.required', 'Required')}
                </th>
                <th className="py-1 pe-2 font-medium">
                  {tr('schedule.v3.workforce.available', 'Available')}
                </th>
                <th className="py-1 pe-2 font-medium">
                  {tr('schedule.v3.workforce.shortage', 'Shortage')}
                </th>
                <th className="py-1 pe-2 font-medium">
                  {tr('schedule.v3.workforce.peak', 'Peak')}
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.dailyPlans.map((d) => (
                <tr key={d.date} className="border-t border-teal-200/40">
                  <td className="py-1 pe-2">{formatDayLabel ? formatDayLabel(d.date) : d.date}</td>
                  <td className="py-1 pe-2 font-mono">{d.requiredHours}h</td>
                  <td className="py-1 pe-2 font-mono">{d.availableHours}h</td>
                  <td className={`py-1 pe-2 font-mono ${d.shortageHours > 0 ? 'text-red-700' : ''}`}>
                    {d.shortageHours}h
                  </td>
                  <td className="py-1 pe-2 font-mono">{d.peakCoverage}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {plan.compensationLedger.length > 0 && (
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pe-2 font-medium">
                    {tr('schedule.v3.workforce.employee', 'Employee')}
                  </th>
                  <th className="py-1 pe-2 font-medium">
                    {tr('schedule.v3.workforce.bridgeShifts', 'Bridge')}
                  </th>
                  <th className="py-1 pe-2 font-medium">
                    {tr('schedule.v3.workforce.overtimeShifts', 'Overtime')}
                  </th>
                  <th className="py-1 pe-2 font-medium">
                    {tr('schedule.v3.workforce.compensationOwed', 'Owed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.compensationLedger.map((e) => (
                  <tr key={e.employeeId} className="border-t border-teal-200/40">
                    <td className="py-1 pe-2">{e.name}</td>
                    <td className="py-1 pe-2 font-mono">{e.bridgeShifts}</td>
                    <td className="py-1 pe-2 font-mono">{e.overtimeHours}h</td>
                    <td className="py-1 pe-2 font-mono font-semibold">{e.compensationOwedHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
