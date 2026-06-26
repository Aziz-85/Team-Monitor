'use client';

import { SPLIT_SHIFT_GLYPH, SPLIT_SHIFT_GLYPH_CLASS, type ScheduleSlotLabel } from '@/lib/schedule/displayName';

export function ScheduleSlotLabelSpan({ label }: { label: ScheduleSlotLabel }) {
  return (
    <span title={label.title}>
      {label.text}
      {label.isSplit ? (
        <span className={SPLIT_SHIFT_GLYPH_CLASS} aria-hidden>
          {' '}
          {SPLIT_SHIFT_GLYPH}
        </span>
      ) : null}
    </span>
  );
}
