'use client';

import { formatSegmentPreview, type ShiftSegmentPreview } from '@/lib/schedule/scheduleUiMetrics';

type Props = {
  availability: string;
  shift: string;
  segments?: ShiftSegmentPreview[];
  t: (key: string) => string;
};

function shiftBadgeLabel(shift: string): string | null {
  if (shift === 'MORNING') return 'AM';
  if (shift === 'EVENING') return 'PM';
  if (shift === 'SPLIT') return 'Split';
  return null;
}

function availabilityLabel(availability: string, t: (key: string) => string): string {
  if (availability === 'LEAVE') return (t('schedule.leave') as string) || 'Leave';
  if (availability === 'OFF' || availability === 'HOLIDAY') return (t('schedule.off') as string) || 'Off';
  if (availability === 'ABSENT') return (t('schedule.absent') as string) || 'Absent';
  return availability;
}

export function ScheduleShiftCellHint({ availability, shift, segments, t }: Props) {
  if (availability !== 'WORK') {
    return (
      <span className="text-[10px] font-medium text-muted">{availabilityLabel(availability, t)}</span>
    );
  }

  const preview = formatSegmentPreview(segments);
  const badge = shiftBadgeLabel(shift);

  if (!badge && !preview) return null;

  return (
    <div className="flex max-w-full flex-col items-center gap-0.5 px-0.5">
      {badge && (
        <span
          className={`rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${
            shift === 'MORNING'
              ? 'bg-sky-100 text-sky-800'
              : shift === 'EVENING'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-violet-100 text-violet-900'
          }`}
        >
          {badge}
        </span>
      )}
      {preview && (
        <span className="max-w-[88px] truncate text-[9px] leading-tight text-muted" title={preview}>
          {preview}
        </span>
      )}
    </div>
  );
}

export function ScheduleShiftReadOnlyBadge({
  shift,
  segments,
}: {
  shift: string;
  segments?: ShiftSegmentPreview[];
  t?: (key: string) => string;
}) {
  const preview = formatSegmentPreview(segments);
  const badge = shiftBadgeLabel(shift);
  if (!badge) return null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
          shift === 'MORNING'
            ? 'border-sky-300 bg-sky-50 text-sky-800'
            : shift === 'EVENING'
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-violet-300 bg-violet-50 text-violet-900'
        }`}
      >
        {badge}
      </span>
      {preview && (
        <span className="max-w-[96px] truncate text-[9px] text-muted" title={preview}>
          {preview}
        </span>
      )}
    </div>
  );
}
