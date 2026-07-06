'use client';

import type { EmployeeDayAssignment } from '@/lib/schedule/generateSchedule/types';
import { cellCompensationHours } from '@/lib/schedule/schedulePresentation';

type Props = {
  assignment: EmployeeDayAssignment;
  onClose: () => void;
  t: (key: string) => string;
};

export function ScheduleCellDetailModal({ assignment, onClose, t }: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;
  const compensation = cellCompensationHours(assignment);
  const reason =
    assignment.reasons[0] ??
    (assignment.shiftKind === 'Bridge'
      ? 'Used to satisfy AM and PM minimum coverage.'
      : assignment.shiftKind === 'Leave'
        ? 'Approved leave.'
        : assignment.shiftKind === 'Off'
          ? 'Weekly off or not scheduled.'
          : 'Assigned to meet coverage requirements.');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {tr('schedule.v3.manager.cellDetails', 'Schedule Details')}
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.employee', 'Employee')}</dt>
            <dd className="font-medium text-foreground">{assignment.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.shift', 'Shift')}</dt>
            <dd className="font-semibold text-foreground">{assignment.shiftKind}</dd>
          </div>
          {assignment.segments.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.segments', 'Segments')}</dt>
              <dd className="mt-1 space-y-0.5 font-mono text-sm">
                {assignment.segments.map((s, i) => (
                  <div key={i}>
                    {s.startTime}–{s.endTime}
                  </div>
                ))}
              </dd>
            </div>
          )}
          <div className="flex gap-6">
            <div>
              <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.workingHours', 'Working Hours')}</dt>
              <dd className="font-mono font-semibold">{assignment.totalHours.toFixed(1)}h</dd>
            </div>
            {compensation > 0 && (
              <div>
                <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.compensation', 'Compensation')}</dt>
                <dd className="font-mono font-semibold text-amber-800">+{compensation}h</dd>
              </div>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">{tr('schedule.v3.manager.reason', 'Reason')}</dt>
            <dd className="text-foreground">{reason}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
