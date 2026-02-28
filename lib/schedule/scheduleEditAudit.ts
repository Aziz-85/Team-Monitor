export function buildScheduleEditAuditPayload(
  weekStart: string,
  changes: Array<{ date: string; empId: string; originalEffectiveShift: string; newShift: string }>
): { weekStart: string; changes: Array<{ date: string; empId: string; field: string; before: string; after: string }>; counts: { changedDays: number; changedCells: number } } {
  const changedDays = new Set(changes.map((c) => c.date)).size;
  return {
    weekStart,
    changes: changes.map((c) => ({
      date: c.date,
      empId: c.empId,
      field: 'effectiveShift',
      before: c.originalEffectiveShift,
      after: c.newShift,
    })),
    counts: { changedDays, changedCells: changes.length },
  };
}
