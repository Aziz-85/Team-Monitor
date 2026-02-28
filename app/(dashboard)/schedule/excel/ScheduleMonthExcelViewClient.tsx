'use client';

import { getFirstName } from '@/lib/name';
import { getWeekStartSaturday } from '@/lib/utils/week';

export type MonthExcelDayRow = {
  date: string;
  dowLabel: string;
  isFriday: boolean;
  morningAssignees: string[];
  eveningAssignees: string[];
  rashidCoverage: Array<{ name: string; shift: 'AM' | 'PM' }>;
  amCount: number;
  pmCount: number;
  minAm: number;
  minPm: number;
  warnings: string[];
};

const MORNING_SLOTS = 4;
const EVENING_SLOTS = 4;

function weekStartSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const start = getWeekStartSaturday(d);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function ScheduleMonthExcelViewClient({
  month,
  dayRows,
  formatDDMM,
  t,
}: {
  month: string;
  dayRows: MonthExcelDayRow[];
  formatDDMM: (d: string) => string;
  t: (k: string) => string;
}) {
  const cellBase = 'border border-slate-200 px-2 py-1 text-center text-sm';
  const headerCell = 'border border-slate-200 bg-slate-300 px-2 py-1 text-center text-sm font-semibold text-slate-800';
  const headerDayEnd = `${headerCell} border-r-2 border-slate-400`;
  const headerMorningBlock = `${headerCell} border-l-2 border-r-2 border-blue-300`;
  const headerEveningBlock = `${headerCell} border-l-2 border-r-2 border-amber-300`;
  const headerRashid = `${headerCell} border-l-2 border-slate-400`;
  const headerAm = `${headerCell} border-l-2 border-slate-400`;
  const headerPm = `${headerCell} border-l-2 border-slate-400`;
  const morningCell = `${cellBase} bg-blue-50 text-blue-900`;
  const morningFirst = `${morningCell} border-l-2 border-blue-300`;
  const morningLast = `${morningCell} border-r-2 border-blue-300`;
  const eveningCell = `${cellBase} bg-amber-50 text-amber-900`;
  const eveningFirst = `${eveningCell} border-l-2 border-amber-300`;
  const eveningLast = `${eveningCell} border-r-2 border-amber-300`;
  const rashidCell = `${cellBase} bg-slate-50 text-slate-700 border-l-2 border-slate-400`;
  const amCountCell = `${cellBase} bg-blue-100 font-semibold border-l-2 border-slate-400`;
  const pmCountCell = `${cellBase} bg-amber-100 font-semibold border-l-2 border-slate-400`;

  const rowsByDate = new Map(dayRows.map((r) => [r.date, r]));

  const [year, monthNum] = month.split('-').map(Number);
  const firstOfMonth = `${month}-01`;
  const lastDateObj = new Date(Date.UTC(year, monthNum, 0));
  const lastOfMonth = lastDateObj.toISOString().slice(0, 10);

  const weeks: string[][] = [];
  let currentWeekStart = weekStartSaturday(firstOfMonth);
  while (currentWeekStart <= lastOfMonth) {
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(addDays(currentWeekStart, i));
    }
    weeks.push(weekDates);
    currentWeekStart = addDays(currentWeekStart, 7);
  }

  return (
    <div className="overflow-hidden" dir="ltr">
      {weeks.map((weekDates) => {
        const start = weekDates[0];
        const end = weekDates[6];
        return (
          <div key={start}>
            <div className="mb-2 mt-4 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>
                {(t('schedule.weekOf') ?? 'Week of {start} – {end}')
                  .replace('{start}', formatDDMM(start))
                  .replace('{end}', formatDDMM(end))}
              </span>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={headerCell} scope="col">
                    {t('schedule.date')}
                  </th>
                  <th className={headerDayEnd} scope="col">
                    {t('schedule.dayName')}
                  </th>
                  <th className={headerMorningBlock} colSpan={MORNING_SLOTS} scope="colgroup">
                    {t('schedule.morning')}
                  </th>
                  <th className={headerEveningBlock} colSpan={EVENING_SLOTS} scope="colgroup">
                    {t('schedule.evening')}
                  </th>
                  <th className={headerRashid} scope="col">
                    {t('schedule.rashidCoverage')}
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
                {weekDates.map((dateStr) => {
                  const inMonth = dateStr.slice(0, 7) === month;
                  const row = rowsByDate.get(dateStr);
                  const morning = row ? row.morningAssignees.map(getFirstName) : [];
                  const evening = row ? row.eveningAssignees.map(getFirstName) : [];
                  const rashidFirst = row?.rashidCoverage[0];
                  const amCount = row?.amCount ?? null;
                  const pmCount = row?.pmCount ?? null;
                  const mutedClass = inMonth ? '' : 'bg-slate-50 text-slate-400';

                  return (
                    <tr key={dateStr} className={mutedClass}>
                      <td className={cellBase}>{inMonth ? formatDDMM(dateStr) : ''}</td>
                      <td className={`${cellBase} border-r-2 border-slate-400`} dir="auto">
                        {row?.dowLabel ?? ''}
                      </td>
                      {Array.from({ length: MORNING_SLOTS }, (_, i) => (
                        <td
                          key={i}
                          className={i === 0 ? morningFirst : i === MORNING_SLOTS - 1 ? morningLast : morningCell}
                        >
                          {inMonth && morning[i] && morning[i].trim() ? morning[i] : '—'}
                        </td>
                      ))}
                      {Array.from({ length: EVENING_SLOTS }, (_, i) => (
                        <td
                          key={i}
                          className={i === 0 ? eveningFirst : i === EVENING_SLOTS - 1 ? eveningLast : eveningCell}
                        >
                          {inMonth && evening[i] && evening[i].trim() ? evening[i] : '—'}
                        </td>
                      ))}
                      <td className={rashidCell}>
                        {inMonth && rashidFirst ? (
                          <>
                            {getFirstName(rashidFirst.name)}
                            <span
                              className={`ml-1 rounded px-1 py-0.5 text-[10px] leading-4 ${
                                rashidFirst.shift === 'AM' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                              }`}
                              dir="ltr"
                            >
                              {rashidFirst.shift === 'AM'
                                ? t('schedule.rashid.amShort')
                                : t('schedule.rashid.pmShort')}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={amCountCell}>{inMonth && amCount != null ? amCount : ''}</td>
                      <td className={pmCountCell}>{inMonth && pmCount != null ? pmCount : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {dayRows.some((r) => r.warnings.length > 0) && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {dayRows.flatMap((r) => r.warnings.map((w) => `${formatDDMM(r.date)}: ${w}`)).join('; ')}
        </div>
      )}
    </div>
  );
}
