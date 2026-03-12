'use client';

type Props = {
  expectedPct: number;
  actualPct: number;
};

export function PaceIndicatorCard({ expectedPct, actualPct }: Props) {
  const delta = actualPct - expectedPct;
  const status: 'ahead' | 'onpace' | 'behind' =
    delta >= 5 ? 'ahead' : delta >= -5 ? 'onpace' : 'behind';

  const statusConfig = {
    ahead: {
      label: 'Ahead',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-700',
      delta: 'text-emerald-600',
    },
    onpace: {
      label: 'On pace',
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      delta: 'text-amber-600',
    },
    behind: {
      label: 'Behind',
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      delta: 'text-red-600',
    },
  };

  const cfg = statusConfig[status];
  const deltaStr = delta >= 0 ? `+${delta}%` : `${delta}%`;

  return (
    <div className={`rounded-xl border p-4 shadow-sm md:p-5 ${cfg.bg}`}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
        Performance vs expected pace
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Expected today</p>
          <p className="text-xl font-bold text-foreground">{expectedPct}%</p>
        </div>
        <div>
          <p className="text-xs text-muted">Actual</p>
          <p className="text-xl font-bold text-foreground">{actualPct}%</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-muted">Status</p>
          <p className={`text-xl font-bold ${cfg.text}`}>{cfg.label}</p>
          <p className={`text-sm font-medium ${cfg.delta}`}>{deltaStr}</p>
        </div>
      </div>
    </div>
  );
}
