'use client';

import type { ExecBadgeStatus } from './ExecBadge';
import { ExecBadge } from './ExecBadge';

export type ExecDataCellProps = {
  value: string | number | null | undefined;
  status?: ExecBadgeStatus;
  align?: 'left' | 'right';
  /** Optional inline bullet for Ach% (small) */
  bullet?: React.ReactNode;
};

export function ExecDataCell({
  value,
  status,
  align = 'left',
  bullet,
}: ExecDataCellProps) {
  const displayValue = value != null && value !== '' ? String(value) : '—';
  const alignClass = align === 'right' ? 'text-right tabular-nums' : 'text-left';

  return (
    <td className={`max-w-0 py-3 px-3 text-slate-900 ${alignClass}`}>
      <div
        className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${align === 'right' ? 'justify-end' : ''}`}
      >
        <span className="min-w-0 truncate">{displayValue}</span>
        {status != null && status !== 'neutral' && (
          <ExecBadge status={status} />
        )}
      </div>
      {bullet != null && <div className="mt-1 min-w-0">{bullet}</div>}
    </td>
  );
}
