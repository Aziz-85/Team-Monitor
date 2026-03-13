'use client';

import { CardShell } from '../cards/CardShell';

type Props = {
  /** Message for the selected day (if it has a coverage issue). */
  selectedDayMessage: string | null;
  /** Number of days in the week with coverage issues. */
  weekWarningCount: number;
  suggestedAction: {
    employeeName: string;
    impact: { amBefore: number; pmBefore: number; amAfter: number; pmAfter: number };
  } | null;
  onApplySuggestion: () => void;
  applying: boolean;
  applyLabel: string;
  beforeAfterLabel: string;
  moveSuggestionLabel: string;
  titleLabel: string;
  selectedDayLabel: string;
  selectedDateNoIssueLabel: string;
  selectedDateAllClearLabel: string;
  thisWeekLabel: string;
  thisWeekDaysNeedAttentionLabel: string;
  thisWeekNoWarningsLabel: string;
  suggestedActionLabel: string;
};

export function CoverageStatusCard({
  selectedDayMessage,
  weekWarningCount,
  suggestedAction,
  onApplySuggestion,
  applying,
  applyLabel,
  beforeAfterLabel,
  moveSuggestionLabel,
  titleLabel,
  selectedDayLabel,
  selectedDateNoIssueLabel,
  selectedDateAllClearLabel,
  thisWeekLabel,
  thisWeekDaysNeedAttentionLabel,
  thisWeekNoWarningsLabel,
  suggestedActionLabel,
}: Props) {
  const hasSelectedDayIssue = (selectedDayMessage?.trim().length ?? 0) > 0;
  const hasWeekIssues = weekWarningCount > 0;
  const allClear = !hasSelectedDayIssue && !hasWeekIssues;

  const selectedDateStatus = hasSelectedDayIssue
    ? selectedDayMessage!
    : allClear
      ? selectedDateAllClearLabel
      : selectedDateNoIssueLabel;

  const weekStatus = hasWeekIssues
    ? thisWeekDaysNeedAttentionLabel.replace('{count}', String(weekWarningCount))
    : thisWeekNoWarningsLabel;

  return (
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {titleLabel}
      </h3>
      <div className="space-y-4">
        {/* Primary: selected date status */}
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            <span className="font-medium text-muted">{selectedDayLabel}:</span>{' '}
            <span className={hasSelectedDayIssue ? 'text-amber-800 font-medium' : 'text-foreground'}>
              {selectedDateStatus}
            </span>
          </p>
        </div>

        {/* Secondary: week-wide summary */}
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            <span className="font-medium text-muted">{thisWeekLabel}:</span>{' '}
            <span className={hasWeekIssues ? 'text-amber-800 font-medium' : 'text-foreground'}>
              {weekStatus}
            </span>
          </p>
        </div>

        {/* Suggested action (selected date only) */}
        {suggestedAction && hasSelectedDayIssue && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800/80">
              {suggestedActionLabel}
            </p>
            <p className="mt-1 text-sm font-medium text-amber-900">
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
