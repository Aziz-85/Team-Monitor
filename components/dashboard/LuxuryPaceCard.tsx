'use client';

type Props = {
  expectedPct: number;
  actualPct: number;
};

export function LuxuryPaceCard({ expectedPct, actualPct }: Props) {
  const delta = actualPct - expectedPct;
  const status: 'ahead' | 'onpace' | 'behind' =
    delta >= 5 ? 'ahead' : delta >= -5 ? 'onpace' : 'behind';

  const config = {
    ahead: {
      bg: 'bg-emerald-50/80',
      border: 'border-emerald-200',
      label: 'Ahead',
      labelClass: 'text-emerald-700',
      deltaClass: 'text-emerald-600',
      statusDot: 'bg-emerald-500',
    },
    onpace: {
      bg: 'bg-amber-50/80',
      border: 'border-amber-200',
      label: 'On pace',
      labelClass: 'text-amber-700',
      deltaClass: 'text-amber-600',
      statusDot: 'bg-amber-500',
    },
    behind: {
      bg: 'bg-red-50/80',
      border: 'border-red-200',
      label: 'Behind',
      labelClass: 'text-red-700',
      deltaClass: 'text-red-600',
      statusDot: 'bg-red-500',
    },
  };

  const cfg = config[status];
  const deltaStr = delta >= 0 ? `+${delta}%` : `${delta}%`;

  return (
    <div
      className={`group rounded-2xl border-2 p-6 shadow-sm transition-all duration-200 hover:shadow-md ${cfg.bg} ${cfg.border}`}
    >
      <h3 className="mb-5 text-xs font-medium uppercase tracking-widest text-muted">
        Performance vs expected pace
      </h3>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Expected today</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground md:text-3xl">
            {expectedPct}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Actual</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground md:text-3xl">
            {actualPct}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Delta</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums md:text-3xl ${cfg.deltaClass}`}>
            {deltaStr}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${cfg.statusDot}`} aria-hidden />
          <div>
            <p className={`text-lg font-semibold ${cfg.labelClass}`}>{cfg.label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
