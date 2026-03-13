'use client';

import Link from 'next/link';
import { CardShell } from '../cards/CardShell';

type AlertItem = {
  id: string;
  name: string;
  daysRemaining: number;
  status: 'expired' | 'urgent' | 'warning';
};

type NextExpiry = { name: string; daysRemaining: number } | null;

type Props = {
  alerts: AlertItem[];
  nextExpiry: NextExpiry;
  titleLabel: string;
  allValidLabel: string;
  nextExpiryLabel: string;
  expiredAgoLabel: string;
  daysRemainingLabel: string;
  viewAllLabel?: string;
  viewAllHref?: string;
};

function StatusIcon({ status }: { status: AlertItem['status'] }) {
  return (
    <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${status === 'expired' ? 'bg-red-600' : status === 'urgent' ? 'bg-amber-500' : 'bg-yellow-500'}`} aria-hidden />
  );
}

export function ComplianceExpiryCard({
  alerts,
  nextExpiry,
  titleLabel,
  allValidLabel,
  nextExpiryLabel,
  expiredAgoLabel,
  daysRemainingLabel,
  viewAllLabel,
  viewAllHref = '/compliance',
}: Props) {
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.status === 'expired' && b.status !== 'expired') return -1;
    if (a.status !== 'expired' && b.status === 'expired') return 1;
    return a.daysRemaining - b.daysRemaining;
  });

  return (
    <CardShell variant="home">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
          {titleLabel}
        </h3>
        {viewAllLabel && (
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-accent hover:underline"
          >
            {viewAllLabel}
          </Link>
        )}
      </div>
      {sortedAlerts.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50/60 py-3 px-4">
            <span className="text-emerald-600">✓</span>
            <span className="text-sm font-medium text-emerald-800">{allValidLabel}</span>
          </div>
          {nextExpiry && (
            <p className="text-sm text-muted">
              {nextExpiryLabel
                .replace('{name}', nextExpiry.name)
                .replace('{count}', String(nextExpiry.daysRemaining))}
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedAlerts.map((a) => {
            const isExpired = a.status === 'expired';
            const days = Math.abs(a.daysRemaining);
            const statusText = isExpired
              ? expiredAgoLabel.replace('{count}', String(days))
              : daysRemainingLabel.replace('{count}', String(a.daysRemaining));
            return (
              <li
                key={a.id}
                className={`flex items-start gap-3 rounded-lg px-4 py-2.5 text-sm ${
                  isExpired ? 'bg-red-50' : a.status === 'urgent' ? 'bg-amber-50' : 'bg-yellow-50/60'
                }`}
              >
                <StatusIcon status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium truncate ${isExpired ? 'text-red-800 font-bold' : a.status === 'urgent' ? 'text-amber-800' : 'text-yellow-800'}`}>
                    {a.name}
                  </p>
                  <p className={`mt-0.5 tabular-nums ${isExpired ? 'text-red-700 font-medium' : a.status === 'urgent' ? 'text-amber-700' : 'text-yellow-800'}`}>
                    {statusText}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
