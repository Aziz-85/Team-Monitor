'use client';

type Props = {
  primaryLabel: string;
  backupLabel: string;
  unassignedLabel: string;
  tasks: Array<{
    taskName: string;
    assignedTo: string | null;
    reason: string;
    reasonNotes: string[];
  }>;
};

export function KeyHolderCard({
  primaryLabel,
  backupLabel,
  unassignedLabel,
  tasks,
}: Props) {
  const primaryTask = tasks.find((t) => t.reason === 'Primary' && t.assignedTo);
  const backupTask = tasks.find((t) => (t.reason === 'Backup1' || t.reason === 'Backup2') && t.assignedTo);
  const holder = primaryTask?.assignedTo ?? backupTask?.assignedTo ?? null;
  const badge = primaryTask ? primaryLabel : backupTask ? backupLabel : unassignedLabel;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Key Holder Today
      </h3>
      {holder ? (
        <div className="space-y-2">
          <p className="text-xl font-semibold text-foreground">{holder}</p>
          <span className="inline-flex rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium text-accent">
            {badge}
          </span>
          {primaryTask?.reasonNotes?.length ? (
            <p className="mt-2 text-xs text-muted">{primaryTask.reasonNotes.join('; ')}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted">—</p>
      )}
    </div>
  );
}
