'use client';

import { useCallback, useMemo } from 'react';
import { getFirstName } from '@/lib/name';
import { getVisibleSlotCount, getSlotColumnClass } from '@/lib/schedule/scheduleSlots';
import { SCHEDULE_UI, SCHEDULE_COLS } from '@/lib/scheduleUi';
import { ScheduleCellSelect } from '@/components/schedule/ScheduleCellSelect';

const FRIDAY_DAY_OF_WEEK = 5;

type GridCell = { date: string; availability: string; effectiveShift: string; overrideId: string | null; baseShift: string };
type GridRow = { empId: string; name: string; team: string; cells: GridCell[] };
type GridDay = { date: string; dayName: string; dayOfWeek: number; minAm: number; minPm: number };

type GuestItem = {
  id: string;
  date: string;
  empId: string;
  shift: string;
  employee: { name: string; homeBoutiqueCode: string };
};

export type ScheduleEditExcelViewProps = {
  gridData: { days: GridDay[]; rows: GridRow[]; counts: Array<{ amCount: number; pmCount: number }> };
  weekGuests?: GuestItem[];
  coverageHeaderLabel?: string;
  onRemoveGuestShift?: (id: string) => void;
  removingGuestId?: string | null;
  getDraftShift: (empId: string, date: string, serverEffective: string) => string;
  getRowAndCell: (empId: string, date: string) => { row: GridRow; cell: GridCell } | null;
  addPendingEdit: (empId: string, date: string, newShift: string, row: GridRow, cell: GridCell) => void;
  canEdit: boolean;
  lockedDaySet: Set<string>;
  formatDDMM: (d: string) => string;
  getDayName: (d: string) => string;
  getDayShort?: (d: string) => string;
  t: (key: string) => string;
};

export function ScheduleEditExcelViewClient({
  gridData,
  weekGuests = [],
  coverageHeaderLabel,
  onRemoveGuestShift,
  removingGuestId = null,
  getDraftShift,
  getRowAndCell,
  addPendingEdit,
  canEdit,
  lockedDaySet,
  formatDDMM,
  getDayName,
  getDayShort,
  t,
}: ScheduleEditExcelViewProps) {
  const { days, rows, counts } = gridData;
  const dayShort = (d: string) => (getDayShort ? getDayShort(d) : getDayName(d).slice(0, 3));

  const guestsByDate = useMemo(() => {
    const m = new Map<string, GuestItem[]>();
    for (const g of weekGuests) {
      const d = typeof g.date === 'string' ? g.date : (g.date as Date)?.toISOString?.()?.slice(0, 10) ?? '';
      const list = m.get(d) ?? [];
      list.push(g);
      m.set(d, list);
    }
    return m;
  }, [weekGuests]);
  const coverageLabel = coverageHeaderLabel ?? (t('schedule.rashidCoverage') ?? 'Rashid Coverage');

  const { morningByDay, eveningByDay, rashidByDay, eligibleByDay } = useMemo(() => {
    const morningByDay: string[][] = [];
    const eveningByDay: string[][] = [];
    const rashidByDay: string[] = [];
    const eligibleByDay: GridRow[][] = [];
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const date = days[dayIdx].date;
      const isFriday = days[dayIdx].dayOfWeek === FRIDAY_DAY_OF_WEEK;
      const morning: string[] = [];
      const evening: string[] = [];
      let rashidEmpId: string | null = null;
      const eligible: GridRow[] = [];
      for (const row of rows) {
        const cell = row.cells[dayIdx];
        if (!cell || cell.availability !== 'WORK') continue;
        eligible.push(row);
        const shift = getDraftShift(row.empId, date, cell.effectiveShift);
        if (isFriday) {
          if (shift === 'EVENING') evening.push(row.empId);
        } else {
          if (shift === 'MORNING') morning.push(row.empId);
          if (shift === 'EVENING') evening.push(row.empId);
        }
        if ((shift === 'COVER_RASHID_AM' || shift === 'COVER_RASHID_PM') && rashidEmpId == null) rashidEmpId = row.empId;
      }
      morningByDay.push(morning);
      eveningByDay.push(evening);
      rashidByDay.push(rashidEmpId ?? '');
      eligibleByDay.push(eligible);
    }
    return { morningByDay, eveningByDay, rashidByDay, eligibleByDay };
  }, [days, rows, getDraftShift]);

  const { visibleSlots, maxPerCell } = useMemo(
    () => getVisibleSlotCount({ morningByDay, eveningByDay }),
    [morningByDay, eveningByDay]
  );
  const slotExtra = getSlotColumnClass(visibleSlots);
  const showMaxColumnsWarning = maxPerCell > 6;

  /** أعمدة فارغة طوال الأسبوع تُعطى عرضاً ضيقاً (2rem) */
  const { emptyMorningSlots, emptyEveningSlots } = useMemo(() => {
    const emptyM = Array.from({ length: visibleSlots }, (_, i) =>
      days.every((_, dayIdx) => !(morningByDay[dayIdx] ?? [])[i])
    );
    const emptyE = Array.from({ length: visibleSlots }, (_, i) =>
      days.every((_, dayIdx) => !(eveningByDay[dayIdx] ?? [])[i])
    );
    return { emptyMorningSlots: emptyM, emptyEveningSlots: emptyE };
  }, [days, morningByDay, eveningByDay, visibleSlots]);

  const handleSlotChange = useCallback(
    (date: string, shift: 'MORNING' | 'EVENING', slotIndex: number, newEmpId: string, currentEmpId: string | null) => {
      if (newEmpId === '' || newEmpId === '—') {
        if (currentEmpId) {
          const rc = getRowAndCell(currentEmpId, date);
          if (rc) addPendingEdit(currentEmpId, date, 'NONE', rc.row, rc.cell);
        }
        return;
      }
      if (currentEmpId && currentEmpId !== newEmpId) {
        const rcPrev = getRowAndCell(currentEmpId, date);
        if (rcPrev) addPendingEdit(currentEmpId, date, 'NONE', rcPrev.row, rcPrev.cell);
      }
      const rc = getRowAndCell(newEmpId, date);
      if (rc) addPendingEdit(newEmpId, date, shift, rc.row, rc.cell);
    },
    [getRowAndCell, addPendingEdit]
  );

  const handleRashidChange = useCallback(
    (date: string, newEmpId: string, currentEmpId: string | null) => {
      if (newEmpId === '' || newEmpId === '—') {
        if (currentEmpId) {
          const rc = getRowAndCell(currentEmpId, date);
          if (rc) addPendingEdit(currentEmpId, date, 'NONE', rc.row, rc.cell);
        }
        return;
      }
      if (currentEmpId && currentEmpId !== newEmpId) {
        const rcPrev = getRowAndCell(currentEmpId, date);
        if (rcPrev) addPendingEdit(currentEmpId, date, 'NONE', rcPrev.row, rcPrev.cell);
      }
      const rc = getRowAndCell(newEmpId, date);
      if (rc) addPendingEdit(newEmpId, date, 'COVER_RASHID_AM', rc.row, rc.cell);
    },
    [getRowAndCell, addPendingEdit]
  );

  const cellDate = `${SCHEDULE_UI.dateCell} ${SCHEDULE_UI.borderL2} text-center`;
  const headerCell = `${SCHEDULE_UI.headerCell} text-center`;
  const headerDate = `${headerCell} ${SCHEDULE_UI.borderL2} ${SCHEDULE_COLS.dateExcel}`;
  const headerDayEnd = `${headerCell} border-r-2 border-slate-400 ${SCHEDULE_COLS.dayExcel}`;
  const headerMorningBlock = `${headerCell} border-l-2 border-r-2 border-blue-300`;
  const headerEveningBlock = `${headerCell} border-l-2 border-r-2 border-amber-300`;
  const headerRashid = `${headerCell} ${SCHEDULE_UI.borderL2}`;
  const headerAm = `${SCHEDULE_UI.headerCell} ${SCHEDULE_UI.borderL2} ${SCHEDULE_COLS.countAm}`;
  const headerPm = `${SCHEDULE_UI.headerCell} ${SCHEDULE_UI.borderL2} ${SCHEDULE_COLS.countPm}`;
  const morningCell = `${SCHEDULE_UI.amCell} text-center overflow-hidden`;
  const morningFirst = `${morningCell} border-l-2 border-blue-300`;
  const morningLast = `${morningCell} border-r-2 border-blue-300`;
  const eveningCell = `${SCHEDULE_UI.pmCell} text-center overflow-hidden`;
  const eveningFirst = `${eveningCell} border-l-2 border-amber-300`;
  const eveningLast = `${eveningCell} border-r-2 border-amber-300`;
  const rashidCell = `${SCHEDULE_UI.coverageCell} ${SCHEDULE_UI.borderL2} text-left`;
  const amCountCell = `${SCHEDULE_UI.amCountCell} ${SCHEDULE_UI.borderL2}`;
  const pmCountCell = `${SCHEDULE_UI.pmCountCell} ${SCHEDULE_UI.borderL2}`;

  return (
    <div className="min-w-0 max-w-full" dir="ltr">
      {showMaxColumnsWarning && (
        <p className="mb-1 text-xs text-amber-700" role="status">
          {t('schedule.maxColumnsReachedWarning')}
        </p>
      )}
      <table className={`${SCHEDULE_UI.table} ${visibleSlots > 4 ? 'table-fixed' : ''}`}>
        <colgroup>
          <col className={SCHEDULE_COLS.dateExcel} />
          <col className={SCHEDULE_COLS.dayExcel} />
          {Array.from({ length: visibleSlots }, (_, i) => (
            <col key={`m-${i}`} style={emptyMorningSlots[i] ? { width: '2rem', minWidth: '2rem' } : undefined} />
          ))}
          {Array.from({ length: visibleSlots }, (_, i) => (
            <col key={`e-${i}`} style={emptyEveningSlots[i] ? { width: '2rem', minWidth: '2rem' } : undefined} />
          ))}
          <col />
          <col className={SCHEDULE_COLS.countAm} />
          <col className={SCHEDULE_COLS.countPm} />
        </colgroup>
        <thead>
          <tr>
            <th className={headerDate} scope="col">
              {t('schedule.date')}
            </th>
            <th className={headerDayEnd} scope="col">
              {t('schedule.dayName')}
            </th>
            <th className={headerMorningBlock} colSpan={visibleSlots} scope="colgroup">
              {t('schedule.morning')}
            </th>
            <th className={headerEveningBlock} colSpan={visibleSlots} scope="colgroup">
              {t('schedule.evening')}
            </th>
            <th className={headerRashid} scope="col">
              {coverageLabel}
            </th>
            <th className={headerAm} scope="col">
              {t('schedule.amCount')}
            </th>
            <th className={headerPm} scope="col">
              {t('schedule.pmCount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, dayIdx) => {
            const date = day.date;
            const locked = lockedDaySet.has(date);
            const editable = canEdit && !locked;
            const isFriday = day.dayOfWeek === FRIDAY_DAY_OF_WEEK;
            const morning = morningByDay[dayIdx] ?? [];
            const evening = eveningByDay[dayIdx] ?? [];
            const rashidEmpId = rashidByDay[dayIdx] ?? '';
            const eligible = eligibleByDay[dayIdx] ?? [];
            const amCount = counts[dayIdx]?.amCount ?? 0;
            const pmCount = counts[dayIdx]?.pmCount ?? 0;

            const inOtherMorning = (slotIdx: number) => new Set(morning.filter((_, j) => j !== slotIdx));
            const inOtherEvening = (slotIdx: number) => new Set(evening.filter((_, j) => j !== slotIdx));

            return (
              <tr key={date}>
                <td className={`${cellDate} border-r-2 border-slate-400`} title={formatDDMM(date)}>{formatDDMM(date)}</td>
                <td className={`${SCHEDULE_UI.dayCell} border-r-2 border-slate-400 whitespace-nowrap min-w-0 text-center`} dir="auto" title={getDayName(date)}>
                  {dayShort(date)}
                </td>
                {Array.from({ length: visibleSlots }, (_, i) => {
                  const occupant = morning[i] ?? null;
                  const options = editable ? eligible.filter((emp) => occupant === emp.empId || !inOtherMorning(i).has(emp.empId)) : [];
                  return (
                    <td
                      key={i}
                      className={`${i === 0 ? morningFirst : i === visibleSlots - 1 ? morningLast : morningCell} ${slotExtra} ${emptyMorningSlots[i] ? 'w-[2rem] min-w-0 max-w-[2rem]' : ''}`}
                    >
                      {isFriday ? (
                        <span className="text-slate-500">—</span>
                      ) : editable ? (
                        <ScheduleCellSelect
                          compact
                          value={occupant ?? ''}
                          options={[{ value: '', label: '—' }, ...options.map((emp) => ({ value: emp.empId, label: getFirstName(emp.name) }))]}
                          onChange={(v) => handleSlotChange(date, 'MORNING', i, v, occupant)}
                          aria-label={t('schedule.morning')}
                        />
                      ) : (
                        occupant ? getFirstName(rows.find((r) => r.empId === occupant)?.name ?? '') : '—'
                      )}
                    </td>
                  );
                })}
                {Array.from({ length: visibleSlots }, (_, i) => {
                  const occupant = evening[i] ?? null;
                  const options = editable ? eligible.filter((emp) => occupant === emp.empId || !inOtherEvening(i).has(emp.empId)) : [];
                  return (
                    <td
                      key={i}
                      className={`${i === 0 ? eveningFirst : i === visibleSlots - 1 ? eveningLast : eveningCell} ${slotExtra} ${emptyEveningSlots[i] ? 'w-[2rem] min-w-0 max-w-[2rem]' : ''}`}
                    >
                      {editable ? (
                        <ScheduleCellSelect
                          compact
                          value={occupant ?? ''}
                          options={[{ value: '', label: '—' }, ...options.map((emp) => ({ value: emp.empId, label: getFirstName(emp.name) }))]}
                          onChange={(v) => handleSlotChange(date, 'EVENING', i, v, occupant)}
                          aria-label={t('schedule.evening')}
                        />
                      ) : (
                        occupant ? getFirstName(rows.find((r) => r.empId === occupant)?.name ?? '') : '—'
                      )}
                    </td>
                  );
                })}
                <td className={rashidCell}>
                  <div className="space-y-1">
                    {editable ? (
                      <ScheduleCellSelect
                        compact
                        value={rashidEmpId}
                        options={[{ value: '', label: '—' }, ...eligible.map((emp) => ({ value: emp.empId, label: getFirstName(emp.name) }))]}
                        onChange={(v) => handleRashidChange(date, v, rashidEmpId || null)}
                        aria-label={coverageLabel}
                      />
                    ) : (
                      rashidEmpId ? getFirstName(rows.find((r) => r.empId === rashidEmpId)?.name ?? '') : '—'
                    )}
                    {(guestsByDate.get(date) ?? []).length === 0 ? (
                      <div className="h-[10px] w-[60px] border-b border-slate-200 opacity-70" aria-hidden="true" />
                    ) : (
                      <div className="flex flex-col gap-1 items-start">
                        {(guestsByDate.get(date) ?? []).map((g) => {
                          const pending = (g as { pending?: boolean }).pending;
                          const label = `${getFirstName(g.employee.name)} ${g.shift === 'MORNING' ? 'AM' : 'PM'}${pending ? ` (${t('schedule.pendingApproval') ?? 'في انتظار الموافقة'})` : ''}`;
                          return (
                            <ScheduleCellSelect
                              key={g.id}
                              compact
                              value={g.id}
                              options={pending ? [{ value: g.id, label }] : [{ value: g.id, label }, { value: '__delete__', label: '—' }]}
                              onChange={(v) => {
                                if (!pending && v === '__delete__') onRemoveGuestShift?.(g.id);
                              }}
                              disabled={!editable || removingGuestId === g.id || pending}
                              className="w-fit min-w-[140px] max-w-full"
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </td>
                <td className={amCountCell}>{amCount}</td>
                <td className={pmCountCell}>{pmCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
