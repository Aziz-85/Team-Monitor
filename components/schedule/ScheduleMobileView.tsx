'use client';

/** Uses same row height (38px) and text-sm as schedule table tokens in lib/scheduleUi */
import { Fragment } from 'react';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import { contributesToMorningList, contributesToEveningList, isSplitShift } from '@/lib/schedule/shiftRules';
import { buildScheduleDisplayNames, getScheduleDisplayName } from '@/lib/schedule/displayName';

type GridDay = { date: string; dayName?: string; dayOfWeek: number };
type GridRow = { empId: string; name: string; nameAr?: string | null; team: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> };
type GridData = { days: GridDay[]; rows: GridRow[]; counts?: Array<{ amCount: number; pmCount: number }> };

export type GuestsByDayMobile = Record<string, { am: Array<{ id: string; name: string }>; pm: Array<{ id: string; name: string }> }>;

type ListedName = { key: string; text: string; title: string };

function renderNameList(items: ListedName[]) {
  return items.map((item, idx) => (
    <Fragment key={item.key}>
      {idx > 0 ? ', ' : null}
      <span title={item.title}>{item.text}</span>
    </Fragment>
  ));
}

export function ScheduleMobileView({
  gridData,
  displayNameMap,
  guestsByDay = {},
  formatDDMM,
  getDayName,
  t,
  locale = 'en',
}: {
  gridData: GridData;
  displayNameMap?: Map<string, string>;
  guestsByDay?: GuestsByDayMobile;
  formatDDMM: (d: string) => string;
  getDayName: (d: string, locale: string) => string;
  t: (k: string) => string;
  locale?: string;
}) {
  const { days, rows } = gridData;
  const dayCards = days.map((day, i) => {
    const dayEmployees: Array<{ empId: string; name: string }> = [];
    const morning: ListedName[] = [];
    const evening: ListedName[] = [];
    const rashidAm: ListedName[] = [];
    const rashidPm: ListedName[] = [];
    const isFridayDay = day.dayOfWeek === 5;

    for (const row of rows) {
      const cell = row.cells[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const fullName = getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale);
      dayEmployees.push({ empId: row.empId, name: fullName });
    }

    const dayMap =
      displayNameMap ??
      buildScheduleDisplayNames(dayEmployees);

    for (const row of rows) {
      const cell = row.cells[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const fullName = getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale);
      const short = getScheduleDisplayName(row.empId, fullName, dayMap);
      const splitNote = isSplitShift(cell.effectiveShift) ? ' (SPLIT)' : '';
      const listed = {
        key: row.empId,
        text: `${short}${splitNote}`,
        title: `${fullName}${splitNote}`,
      };
      if (contributesToMorningList(cell.effectiveShift, isFridayDay)) morning.push(listed);
      if (contributesToEveningList(cell.effectiveShift)) evening.push(listed);
      if (cell.effectiveShift === 'COVER_RASHID_AM') rashidAm.push({ ...listed, text: short, title: fullName });
      if (cell.effectiveShift === 'COVER_RASHID_PM') rashidPm.push({ ...listed, text: short, title: fullName });
    }

    return {
      date: day.date,
      dayName: day.dayName ?? getDayName(day.date, locale),
      morning,
      evening,
      rashidAm,
      rashidPm,
    };
  });

  return (
    <div className="space-y-4">
      {dayCards.map((card) => (
        <div
          key={card.date}
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold text-foreground">
            {formatDDMM(card.date)} — {card.dayName}
          </h3>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                {t('schedule.morning')} — {t('schedule.amCount')}: {card.morning.length}
              </div>
              <div className="min-h-[38px] rounded-lg border border-border bg-blue-50/50 px-3 py-2 text-sm text-foreground">
                {card.morning.length > 0 ? renderNameList(card.morning) : null}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                {t('schedule.evening')} — {t('schedule.pmCount')}: {card.evening.length}
              </div>
              <div className="min-h-[38px] rounded-lg border border-border bg-amber-50/50 px-3 py-2 text-sm text-foreground">
                {card.evening.length > 0 ? renderNameList(card.evening) : null}
              </div>
            </div>
            {(card.rashidAm.length > 0 || card.rashidPm.length > 0) && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">
                  {t('schedule.externalCoverage')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.rashidAm.map((item) => (
                    <span
                      key={item.key}
                      title={item.title}
                      className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                    >
                      {item.text} <span className="text-muted">AM</span>
                    </span>
                  ))}
                  {card.rashidPm.map((item) => (
                    <span
                      key={item.key}
                      title={item.title}
                      className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                    >
                      {item.text} <span className="text-muted">PM</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const dayGuests = guestsByDay[card.date];
              const hasGuests = dayGuests && (dayGuests.am.length > 0 || dayGuests.pm.length > 0);
              if (!hasGuests) return null;
              return (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">
                    {t('schedule.externalCoverage') ?? 'External Coverage'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(dayGuests.am ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                      >
                        {g.name} <span className="text-muted">AM</span>
                      </span>
                    ))}
                    {(dayGuests.pm ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                      >
                        {g.name} <span className="text-muted">PM</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
