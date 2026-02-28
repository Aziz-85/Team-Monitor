/**
 * Anti-gaming: flag suspicious mass-completions.
 * WINDOW_MINUTES = 8, MIN_TASKS_IN_WINDOW = 5.
 * If >= 5 completions in 8 min => burst. Severity: 5 in 8m = Low, 6 in 8m = Medium, 7 in 12m = High.
 */

const WINDOW_MS = 8 * 60 * 1000;
const EXTENDED_WINDOW_MS = 12 * 60 * 1000;
const MIN_TASKS_IN_WINDOW = 5;

export type BurstFlag = {
  kind: 'burst';
  severity: 'low' | 'medium' | 'high';
  count: number;
  windowMinutes: number;
  assignee?: string;
};

export type LateBulkFlag = {
  kind: 'late_bulk';
  assignee?: string;
};

export type SameDayBulkFlag = {
  kind: 'same_day_bulk';
  count: number;
  assignee?: string;
};

export type FlagInfo = BurstFlag | LateBulkFlag | SameDayBulkFlag;

/**
 * Parse completedAtRaw to Date or null.
 */
function parseCompletedAt(raw: string | null): Date | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return isNaN(d.getTime()) ? null : d;
}

/**
 * For rows with completedAtRaw, detect bursts per assignee.
 */
export function flagBursts(
  rows: { assignee: string | null; completedAtRaw: string | null; status: string }[]
): Map<number, FlagInfo[]> {
  const rowFlags = new Map<number, FlagInfo[]>();
  const doneRows = rows
    .map((r, i) => ({ i, assignee: r.assignee ?? '', completedAt: parseCompletedAt(r.completedAtRaw ?? null), status: r.status }))
    .filter((r) => r.status === 'DONE' && r.completedAt);
  const byAssignee = new Map<string, typeof doneRows>();
  for (const r of doneRows) {
    const key = r.assignee.trim() || '__unknown__';
    if (!byAssignee.has(key)) byAssignee.set(key, []);
    byAssignee.get(key)!.push(r);
  }
  for (const list of Array.from(byAssignee.values())) {
    list.sort((a: { completedAt: Date | null }, b: { completedAt: Date | null }) => ((a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0)));
    for (let i = 0; i < list.length; i++) {
      const t0 = list[i].completedAt!.getTime();
      let count8 = 0;
      let count12 = 0;
      for (const r of list) {
        const dt = r.completedAt!.getTime() - t0;
        if (dt >= 0 && dt <= WINDOW_MS) count8++;
        if (dt >= 0 && dt <= EXTENDED_WINDOW_MS) count12++;
      }
      const flags: FlagInfo[] = [];
      if (count8 >= 7 || count12 >= 7) {
        flags.push({ kind: 'burst', severity: 'high', count: 7, windowMinutes: 12, assignee: list[i].assignee || undefined });
      } else if (count8 >= 6) {
        flags.push({ kind: 'burst', severity: 'medium', count: count8, windowMinutes: 8, assignee: list[i].assignee || undefined });
      } else if (count8 >= MIN_TASKS_IN_WINDOW) {
        flags.push({ kind: 'burst', severity: 'low', count: count8, windowMinutes: 8, assignee: list[i].assignee || undefined });
      }
      if (flags.length) rowFlags.set(list[i].i, flags);
    }
  }
  return rowFlags;
}

/**
 * Fallback when no timestamps: flag DONE count >= 6 same day (if due dates available).
 */
export function flagSameDayBulk(
  rows: { assignee: string | null; dueDate: string | null; status: string }[]
): Map<number, FlagInfo[]> {
  const rowFlags = new Map<number, FlagInfo[]>();
  const doneByDay = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.status !== 'DONE') return;
    const day = (r.dueDate ?? '').slice(0, 10);
    if (!day) return;
    if (!doneByDay.has(day)) doneByDay.set(day, []);
    doneByDay.get(day)!.push(i);
  });
  for (const indices of Array.from(doneByDay.values())) {
    if (indices.length >= 6) {
      for (const i of indices) {
        rowFlags.set(i, [{ kind: 'same_day_bulk', count: indices.length }]);
      }
    }
  }
  return rowFlags;
}

export function mergeFlags(
  burstFlags: Map<number, FlagInfo[]>,
  sameDayFlags: Map<number, FlagInfo[]>
): Map<number, FlagInfo[]> {
  const out = new Map<number, FlagInfo[]>();
  for (const [i, f] of Array.from(burstFlags)) out.set(i, [...(out.get(i) ?? []), ...f]);
  for (const [i, f] of Array.from(sameDayFlags)) {
    const existing = out.get(i) ?? [];
    if (!existing.some((e) => e.kind === 'same_day_bulk')) out.set(i, [...existing, ...f]);
  }
  return out;
}
