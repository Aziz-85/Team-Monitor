'use client';

import { CardShell } from '../cards/CardShell';

type AlertItem = {
  key: string;
  label: string;
  value: string;
  severity?: 'info' | 'warn' | 'error';
};

type Props = {
  alerts: AlertItem[];
  title?: string;
  allClearLabel?: string;
};

export function OperationalAlertsCard({ alerts, title = 'Operational Alerts', allClearLabel = 'All clear' }: Props) {
  const displayAlerts = alerts.filter((a) => a.value?.trim());
  return (
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {displayAlerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50/60 py-3 px-4">
          <span className="text-emerald-600">✓</span>
          <span className="text-sm font-medium text-emerald-800">{allClearLabel}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {displayAlerts.map((a) => (
            <div
              key={a.key}
              className={`flex min-w-0 flex-col gap-1 rounded-lg px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
                a.severity === 'error'
                  ? 'bg-red-50 text-red-800'
                  : a.severity === 'warn'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-slate-50 text-slate-700'
              }`}
            >
              <span className="min-w-0 font-medium">{a.label}</span>
              <span className="min-w-0 break-words sm:text-end">{a.value}</span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
