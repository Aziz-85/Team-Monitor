'use client';

type Props = {
  t: (key: string) => string;
  draftGuestCount: number;
  onYes: () => void;
  onNo: () => void;
};

export function ExternalSupportStep({ t, draftGuestCount, onYes, onNo }: Props) {
  const tr = (key: string, fallback: string) => (t(key) as string) || fallback;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          {tr('schedule.proposal.supportTitle', 'External Support')}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {tr(
            'schedule.proposal.supportQuestion',
            'Is there support from another branch this week?'
          )}
        </p>
      </div>

      {draftGuestCount > 0 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {tr('schedule.proposal.supportAdded', '{n} external coverage shift(s) added.').replace(
            '{n}',
            String(draftGuestCount)
          )}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onYes}
          className="h-10 flex-1 rounded-lg border border-[#0F4C3A] bg-[#0F4C3A] px-4 text-sm font-semibold text-white hover:bg-[#0d3f30]"
        >
          {tr('schedule.proposal.supportYes', 'Yes, add support')}
        </button>
        <button
          type="button"
          onClick={onNo}
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-subtle"
        >
          {tr('schedule.proposal.supportNo', 'No, continue without support')}
        </button>
      </div>
    </div>
  );
}
