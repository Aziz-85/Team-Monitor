'use client';

/**
 * Compact name chip for schedule cells: full first name only.
 * Tooltip/popover shows full name + empId (when provided).
 */

import { useState, useRef, useEffect } from 'react';
import { getFirstName } from '@/lib/name';

export type NameChipVariant = 'am' | 'pm' | 'rashid';

function firstInitial(name: string): string {
  const t = name.trim();
  return (t[0] ?? '?').toUpperCase();
}

const CHIP_TEXT: Record<NameChipVariant, string> = {
  am: 'text-sky-800',
  pm: 'text-amber-900',
  rashid: 'text-slate-700',
};

const AVATAR_STYLES: Record<NameChipVariant, string> = {
  am: 'bg-sky-200 text-sky-900',
  pm: 'bg-amber-200 text-amber-900',
  rashid: 'bg-slate-200 text-slate-800',
};

export function NameChip({
  name,
  empId,
  variant = 'rashid',
  suffix = '',
}: {
  name: string;
  empId?: string;
  variant?: NameChipVariant;
  suffix?: string;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const displayText = getFirstName(name);
  const initial = firstInitial(name);
  const tooltipText = empId ? `${name} (${empId})` : suffix ? `${name} ${suffix}` : name;

  useEffect(() => {
    if (!popoverOpen) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPopoverOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [popoverOpen]);

  return (
    <span ref={ref} className="relative inline-flex">
      <span
        role="button"
        tabIndex={0}
        title={tooltipText}
        aria-label={tooltipText}
        onClick={() => setPopoverOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPopoverOpen((o) => !o);
          }
        }}
        className={`inline-flex max-w-full min-w-0 cursor-default items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium transition-colors ${CHIP_TEXT[variant]}`}
      >
        <span
          className={`h-4 w-4 shrink-0 rounded-full grid place-items-center text-[9px] font-bold leading-none ${AVATAR_STYLES[variant]}`}
          aria-hidden
        >
          {initial}
        </span>
        <span className="min-w-0 truncate text-inherit">{displayText}</span>
        {suffix ? <span className="shrink-0 text-inherit opacity-90">{suffix}</span> : null}
      </span>
      {popoverOpen && (empId || name) && (
        <span
          className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 shadow-lg"
          role="tooltip"
        >
          {name}
          {empId ? (
            <>
              <br />
              <span className="text-slate-500" dir="ltr">
                {empId}
              </span>
            </>
          ) : null}
        </span>
      )}
    </span>
  );
}
