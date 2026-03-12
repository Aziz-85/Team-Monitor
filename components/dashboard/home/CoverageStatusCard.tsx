'use client';

type Props = {
  warningCount: number;
  summary: string;
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
};

export function CoverageStatusCard({
  warningCount,
  summary,
  suggestedAction,
  onApplySuggestion,
  applying,
  applyLabel,
  noWarningsLabel,
  beforeAfterLabel,
  moveSuggestionLabel,
}: Props) {
  const hasWarnings = warningCount > 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Coverage Status
      </h3>
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums text-foreground">{warningCount}</span>
          <span className="text-sm text-muted">warnings this week</span>
        </div>
        <p className="text-sm text-foreground">
          {hasWarnings ? summary : noWarningsLabel}
        </p>
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
    </div>
  );
}
