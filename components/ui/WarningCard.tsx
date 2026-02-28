import { ReactNode } from 'react';

export function WarningCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-100 p-3 text-amber-900 md:p-4">
      <p className="text-sm font-medium leading-6">{children}</p>
    </div>
  );
}
