'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/lib/i18n/useT';

type ScheduleFullExportButtonProps = {
  weekStart: string;
  disabled?: boolean;
  className?: string;
};

export function ScheduleFullExportButton({
  weekStart,
  disabled = false,
  className = '',
}: ScheduleFullExportButtonProps) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!weekStart || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/schedule/export/full?weekStart=${encodeURIComponent(weekStart)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `schedule-full-data-${weekStart}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }, [weekStart, loading]);

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`.trim()}>
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled || loading || !weekStart}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        title={t('schedule.exportFullDataHint')}
      >
        {loading ? t('schedule.exportFullDataLoading') : t('schedule.exportFullData')}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
