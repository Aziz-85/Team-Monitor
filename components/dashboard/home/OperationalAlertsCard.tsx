'use client';

type AlertItem = {
  key: string;
  label: string;
  value: string;
  severity?: 'info' | 'warn' | 'error';
};

type Props = {
  alerts: AlertItem[];
};

export function OperationalAlertsCard({ alerts }: Props) {
  const displayAlerts = alerts.filter((a) => a.value?.trim());
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Operational Alerts
      </h3>
      {displayAlerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50/60 py-3 px-4">
          <span className="text-emerald-600">✓</span>
          <span className="text-sm font-medium text-emerald-800">All clear</span>
        </div>
      ) : (
        <div className="space-y-2">
          {displayAlerts.map((a) => (
            <div
              key={a.key}
              className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
                a.severity === 'error'
                  ? 'bg-red-50 text-red-800'
                  : a.severity === 'warn'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-medium">{a.label}</span>
              <span className="tabular-nums">{a.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
