'use client';

import type { EmployeeDayAssignment, DayOperatingConfig } from '@/lib/schedule/generateSchedule/types';
import type { ScheduleGridRow, ScheduleSummary } from '@/lib/schedule/schedulePresentation';
import { dayShortLabel, sortDaysSatToFri } from '@/lib/schedule/schedulePresentation';
import { buildScheduleExplanation } from '@/lib/schedule/schedulePresentation';

type GridProps = {
  rows: ScheduleGridRow[];
  days: DayOperatingConfig[];
  onCellClick: (assignment: EmployeeDayAssignment) => void;
};

function ShiftCell({
  assignment,
  onClick,
}: {
  assignment: EmployeeDayAssignment | undefined;
  onClick: () => void;
}) {
  if (!assignment || assignment.shiftKind === 'Off') {
    return (
      <button
        type="button"
        onClick={() => assignment && onClick()}
        disabled={!assignment}
        className="flex min-h-[4.5rem] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-surface-subtle/50 px-1 py-2 text-xs text-muted transition hover:bg-surface-subtle disabled:cursor-default disabled:hover:bg-surface-subtle/50"
      >
        Off
      </button>
    );
  }

  if (assignment.shiftKind === 'Leave') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[4.5rem] w-full flex-col items-center justify-center rounded-lg border border-border bg-gray-100 px-1 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
      >
        Leave
      </button>
    );
  }

  const isBridge = assignment.shiftKind === 'Bridge';
  const isAm = assignment.shiftKind === 'AM';
  const isPm = assignment.shiftKind === 'PM';

  const tone = isBridge
    ? 'border-orange-300 bg-orange-50 hover:bg-orange-100/80'
    : isAm
      ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/60'
      : isPm
        ? 'border-sky-200 bg-sky-50/80 hover:bg-sky-100/60'
        : 'border-violet-200 bg-violet-50/80 hover:bg-violet-100/60';

  const label = isBridge ? 'Bridge' : assignment.shiftKind === 'Split' ? 'Split' : assignment.shiftKind;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center transition ${tone}`}
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-wide ${
          isBridge ? 'text-orange-800' : isAm ? 'text-emerald-800' : isPm ? 'text-sky-800' : 'text-violet-800'
        }`}
      >
        {label}
      </span>
      {isBridge && assignment.segments.length >= 2 ? (
        <div className="space-y-0.5 font-mono text-[9px] leading-tight text-orange-900">
          {assignment.segments.map((s, i) => (
            <div key={i}>
              {s.startTime}–{s.endTime}
            </div>
          ))}
        </div>
      ) : assignment.totalHours > 0 ? (
        <span className="text-[10px] text-muted">{assignment.totalHours.toFixed(0)}h</span>
      ) : null}
    </button>
  );
}

export function ScheduleWeeklyGrid({ rows, days, onCellClick }: GridProps) {
  const orderedDays = sortDaysSatToFri(days);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            <th className="sticky left-0 z-10 bg-surface-subtle px-3 py-2.5 text-left text-xs font-semibold text-muted">
              Employee
            </th>
            {orderedDays.map((d) => (
              <th key={d.date} className="min-w-[5.5rem] px-1 py-2.5 text-center text-xs font-semibold text-foreground">
                {dayShortLabel(d.dayOfWeek)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.empId} className="border-b border-border/60 last:border-b-0">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 text-sm font-medium text-foreground">
                {row.name}
              </td>
              {orderedDays.map((d) => {
                const assignment = row.cells.get(d.date);
                return (
                  <td key={d.date} className="p-1 align-top">
                    <ShiftCell
                      assignment={assignment}
                      onClick={() => assignment && onCellClick(assignment)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SummaryProps = {
  summary: ScheduleSummary;
  t: (key: string) => string;
};

export function ScheduleBottomSummary({ summary, t }: SummaryProps) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {tr('schedule.v3.manager.coverageStatus', 'Coverage Status')}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {summary.coverageComplete ? (
              <span className="text-emerald-700">✓ {tr('schedule.v3.manager.coverageComplete', 'Coverage Complete')}</span>
            ) : (
              <span className="text-amber-800">
                {tr('schedule.v3.manager.coveragePartial', 'Coverage')} {summary.coveragePercent}%
              </span>
            )}
          </p>
          {!summary.coverageComplete && summary.missingCoverage.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted">
                {tr('schedule.v3.manager.missingCoverage', 'Missing Coverage')}
              </p>
              <ul className="mt-0.5 text-sm text-amber-900">
                {summary.missingCoverage.map((m) => (
                  <li key={m}>• {m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={tr('schedule.v3.manager.amCoverage', 'AM Coverage')} value={`${summary.amDaysMet}/${summary.totalWorkDays}`} />
          <Stat label={tr('schedule.v3.manager.pmCoverage', 'PM Coverage')} value={`${summary.pmDaysMet}/${summary.totalWorkDays}`} />
          <Stat label={tr('schedule.v3.manager.bridgeCount', 'Bridge Days')} value={String(summary.bridgeDays)} />
          <Stat label={tr('schedule.v3.manager.overtime', 'Overtime Hours')} value={`${summary.overtimeHours}h`} />
          <Stat
            label={tr('schedule.v3.manager.compensation', 'Compensation')}
            value={summary.compensationHours > 0 ? `+${summary.compensationHours}h` : '—'}
            highlight={summary.compensationHours > 0}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${highlight ? 'text-amber-800' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

type ExplanationProps = {
  bullets: string[];
  t: (key: string) => string;
};

export function ScheduleExplanation({ bullets, t }: ExplanationProps) {
  if (!bullets.length) return null;
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  return (
    <div className="rounded-xl border border-border bg-surface-subtle/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {tr('schedule.v3.manager.explanation', 'Schedule Explanation')}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {bullets.map((b, i) => (
          <li key={i}>• {b}</li>
        ))}
      </ul>
    </div>
  );
}

export function buildExplanationFromData(
  assignments: EmployeeDayAssignment[],
  days: DayOperatingConfig[],
  summary: ScheduleSummary
): string[] {
  return buildScheduleExplanation(assignments, days, summary);
}
