'use client';

import { OpsCard } from '@/components/ui/OpsCard';

export function CompanyLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <OpsCard key={i}>
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-40 animate-pulse rounded bg-muted" />
          </OpsCard>
        ))}
      </div>
    </div>
  );
}
