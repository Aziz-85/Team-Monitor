'use client';

/**
 * KPI block — Single metric with optional accent highlight (gold for key KPIs).
 * Minimal; fits Light Corporate Luxury theme.
 */
export type KPIBlockProps = {
  label: string;
  value: string | number;
  highlight?: boolean;
  note?: string;
};

export function KPIBlock({ label, value, highlight = false, note }: KPIBlockProps) {
  return (
    <div
      className="rounded-card p-4 shadow-card"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ color: highlight ? 'var(--accent)' : 'var(--primary)' }}
      >
        {value}
      </p>
      {note != null && note !== '' && (
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
}
