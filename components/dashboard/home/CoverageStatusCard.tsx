'use client';

import { CardShell } from '../cards/CardShell';

type Props = {
  /** Message for the selected day (if it has a coverage issue). */
  selectedDayMessage: string | null;
  /** Number of days in the week with coverage issues. */
  weekWarningCount: number;
  /** Label for "warnings this week" (e.g. "warnings this week"). */
  warningsThisWeekLabel: string;
  /** Label for "X day(s) need attention" (use {count} placeholder). */
  daysNeedAttentionLabel: string;
  suggestedAction: {
    employeeName: string;
    impact: { amBefore: number; pmBefore: number; amAfter: number; pmAfter: number };
  } | null;
  onApplySuggestion: () => void;
  applying: boolean;
  applyLabel: string;
  noWarningsLabel: string;
  beforeAfterLabel: string;
  moveSuggestionLabel: string;
  titleLabel: string;
  selectedDayLabel: string;
};

export function CoverageStatusCard({
  selectedDayMessage,
  weekWarningCount,
  warningsThisWeekLabel,
  daysNeedAttentionLabel,
  suggestedAction,
  onApplySuggestion,
  applying,
  applyLabel,
  noWarningsLabel,
  beforeAfterLabel,
  moveSuggestionLabel,
  titleLabel,
  selectedDayLabel,
}: Props) {
  const hasWarnings = weekWarningCount > 0 || (selectedDayMessage?.trim().length ?? 0) > 0;

  return (
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {titleLabel}
      </h3>
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums text-foreground">{weekWarningCount}</span>
          <span className="text-sm text-muted">{warningsThisWeekLabel}</span>
        </div>
        <div className="space-y-1 text-sm text-foreground">
          {hasWarnings ? (
            <>
              {selectedDayMessage && (
                <p><strong>{selectedDayLabel}:</strong> {selectedDayMessage}</p>
              )}
              {weekWarningCount > 0 && (
                <p>{daysNeedAttentionLabel.replace('{count}', String(weekWarningCount))}</p>
              )}
            </>
          ) : (
            <p>{noWarningsLabel}</p>
          )}
        </div>
        {suggestedAction && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-medium text-amber-900">
              {moveSuggestionLabel.replace('{name}', suggestedAction.employeeName)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {beforeAfterLabel
                .replace('{amBefore}', String(suggestedAction.impact.amBefore))
                .replace('{pmBefore}', String(suggestedAction.impact.pmBefore))
                .replace('{amAfter}', String(suggestedAction.impact.amAfter))
                .replace('{pmAfter}', String(suggestedAction.impact.pmAfter))}
            </p>
            <button
              type="button"
              onClick={onApplySuggestion}
              disabled={applying}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
            >
              {applying ? '…' : applyLabel}
            </button>
          </div>
        )}
      </div>
    </CardShell>
  );
}
