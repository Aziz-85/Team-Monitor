'use client';

/** Uses same row height (38px) and text-sm as schedule table tokens in lib/scheduleUi */
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';

type GridDay = { date: string; dayName?: string; dayOfWeek: number };
type GridRow = { empId: string; name: string; nameAr?: string | null; team: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> };
type GridData = { days: GridDay[]; rows: GridRow[]; counts?: Array<{ amCount: number; pmCount: number }> };

export type GuestsByDayMobile = Record<string, { am: Array<{ id: string; name: string }>; pm: Array<{ id: string; name: string }> }>;

export function ScheduleMobileView({
  gridData,
  guestsByDay = {},
  formatDDMM,
  getDayName,
  t,
  locale = 'en',
}: {
  gridData: GridData;
  guestsByDay?: GuestsByDayMobile;
  formatDDMM: (d: string) => string;
  getDayName: (d: string, locale: string) => string;
  t: (k: string) => string;
  locale?: string;
}) {
  const { days, rows } = gridData;
  const dayCards = days.map((day, i) => {
    const morning: string[] = [];
    const evening: string[] = [];
    const rashidAm: string[] = [];
    const rashidPm: string[] = [];
    for (const row of rows) {
      const cell = row.cells[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const displayName = getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale);
      if (cell.effectiveShift === 'MORNING') morning.push(displayName);
      if (cell.effectiveShift === 'EVENING') evening.push(displayName);
      if (cell.effectiveShift === 'COVER_RASHID_AM') rashidAm.push(displayName);
      if (cell.effectiveShift === 'COVER_RASHID_PM') rashidPm.push(displayName);
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
                {card.morning.length > 0 ? card.morning.join(', ') : '—'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                {t('schedule.evening')} — {t('schedule.pmCount')}: {card.evening.length}
              </div>
              <div className="min-h-[38px] rounded-lg border border-border bg-amber-50/50 px-3 py-2 text-sm text-foreground">
                {card.evening.length > 0 ? card.evening.join(', ') : '—'}
              </div>
            </div>
            {(card.rashidAm.length > 0 || card.rashidPm.length > 0) && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">
                  {t('schedule.externalCoverage')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.rashidAm.map((name) => (
                    <span
                      key={name}
                      className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                    >
                      {name} <span className="text-muted">AM</span>
                    </span>
                  ))}
                  {card.rashidPm.map((name) => (
                    <span
                      key={name}
                      className="rounded border border-border bg-surface-subtle px-2 py-1 text-xs font-medium text-foreground"
                    >
                      {name} <span className="text-muted">PM</span>
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
