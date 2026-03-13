'use client';

import { CardShell } from '../cards/CardShell';

type AlertItem = {
  id: string;
  name: string;
  category: string;
  boutiqueName: string;
  boutiqueCode: string;
  expiryDate: string;
  daysRemaining: number;
  status: 'expired' | 'urgent';
};

type Props = {
  alerts: AlertItem[];
  titleLabel: string;
  emptyLabel: string;
  daysLeftLabel: string;
  expiresInLabel: string;
  expiredAgoLabel: string;
};

export function ComplianceAlertsCard({
  alerts,
  titleLabel,
  emptyLabel,
  daysLeftLabel,
  expiresInLabel,
  expiredAgoLabel,
}: Props) {
  return (
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {titleLabel}
      </h3>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50/60 py-3 px-4">
          <span className="text-emerald-600">✓</span>
          <span className="text-sm font-medium text-emerald-800">{emptyLabel}</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const isExpired = a.status === 'expired';
            const days = Math.abs(a.daysRemaining);
            const text = isExpired
              ? expiredAgoLabel.replace('{count}', String(days))
              : a.daysRemaining <= 30
                ? expiresInLabel.replace('{count}', String(a.daysRemaining))
                : daysLeftLabel.replace('{count}', String(a.daysRemaining));
            return (
              <li
                key={a.id}
                className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
                  isExpired ? 'bg-red-50 font-bold text-red-800' : 'bg-amber-50 text-amber-800'
                }`}
              >
                <span className="font-medium truncate min-w-0">{a.name}</span>
                <span className="tabular-nums shrink-0 ms-2">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
