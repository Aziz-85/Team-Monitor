'use client';

type Props = {
  morningLabel: string;
  eveningLabel: string;
  amEmployees: Array<{ empId: string; name: string }>;
  pmEmployees: Array<{ empId: string; name: string }>;
};

export function ShiftSnapshotCard({
  morningLabel,
  eveningLabel,
  amEmployees,
  pmEmployees,
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Shift Snapshot
      </h3>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-sky-700">{morningLabel}</span>
            <span className="text-lg font-bold tabular-nums text-sky-800">{amEmployees.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {amEmployees.map((e) => (
              <span
                key={e.empId}
                className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800"
              >
                {e.name}
              </span>
            ))}
            {amEmployees.length === 0 && (
              <span className="text-xs text-muted">—</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-amber-700">{eveningLabel}</span>
            <span className="text-lg font-bold tabular-nums text-amber-800">{pmEmployees.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pmEmployees.map((e) => (
              <span
                key={e.empId}
                className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
              >
                {e.name}
              </span>
            ))}
            {pmEmployees.length === 0 && (
              <span className="text-xs text-muted">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
