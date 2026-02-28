import React, { forwardRef, ReactNode } from 'react';

export function LuxuryTable({
  children,
  className = '',
  noScroll,
}: {
  children: ReactNode;
  className?: string;
  /** When true, no horizontal scroll; table fits container (e.g. schedule edit page). */
  noScroll?: boolean;
}) {
  return (
    <div
      className={`w-full rounded-xl border border-slate-200 bg-white ${noScroll ? 'overflow-hidden' : 'overflow-x-auto'} ${className}`}
    >
      <table className={`w-full border-collapse text-sm ${noScroll ? 'min-w-0 table-fixed' : 'min-w-[600px]'}`}>
        {children}
      </table>
    </div>
  );
}

export function LuxuryTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
        {children}
      </tr>
    </thead>
  );
}

export const LuxuryTh = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function LuxuryTh({ children, className = '', ...props }, ref) {
    return (
      <th
        ref={ref}
        className={`border-b border-slate-200 px-3 py-2 text-xs md:text-sm font-semibold text-slate-700 ${className}`}
        {...props}
      >
        {children}
      </th>
    );
  }
);

export function LuxuryTableBody({ children }: { children: ReactNode }) {
  return <tbody className="bg-white">{children}</tbody>;
}

export function LuxuryTd({
  children,
  className = '',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`border-b border-slate-200 px-3 py-2 text-sm ${className}`} {...props}>
      {children}
    </td>
  );
}
