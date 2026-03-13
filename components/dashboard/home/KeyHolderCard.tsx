'use client';

import { CardShell } from '../cards/CardShell';

type Props = {
  title: string;
  subtitle?: string | null;
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
  title,
  subtitle,
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
    <CardShell variant="home">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {subtitle && <p className="-mt-2 mb-3 text-xs text-muted">{subtitle}</p>}
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
    </CardShell>
  );
}
