'use client';

/** Uses same row height (38px) and text-sm as schedule table tokens in lib/scheduleUi */
type GridDay = { date: string; dayName?: string; dayOfWeek: number };
type GridRow = { empId: string; name: string; team: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> };
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
      if (cell.effectiveShift === 'MORNING') morning.push(row.name);
      if (cell.effectiveShift === 'EVENING') evening.push(row.name);
      if (cell.effectiveShift === 'COVER_RASHID_AM') rashidAm.push(row.name);
      if (cell.effectiveShift === 'COVER_RASHID_PM') rashidPm.push(row.name);
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
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">
            {formatDDMM(card.date)} — {card.dayName}
          </h3>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">
                {t('schedule.morning')} — {t('schedule.amCount')}: {card.morning.length}
              </div>
              <div className="min-h-[38px] rounded-lg border border-slate-200 bg-blue-50/50 px-3 py-2 text-sm text-slate-800">
                {card.morning.length > 0 ? card.morning.join(', ') : '—'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">
                {t('schedule.evening')} — {t('schedule.pmCount')}: {card.evening.length}
              </div>
              <div className="min-h-[38px] rounded-lg border border-slate-200 bg-amber-50/50 px-3 py-2 text-sm text-slate-800">
                {card.evening.length > 0 ? card.evening.join(', ') : '—'}
              </div>
            </div>
            {(card.rashidAm.length > 0 || card.rashidPm.length > 0) && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">
                  {t('schedule.rashidCoverage')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.rashidAm.map((name) => (
                    <span
                      key={name}
                      className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {name} <span className="text-slate-500">AM</span>
                    </span>
                  ))}
                  {card.rashidPm.map((name) => (
                    <span
                      key={name}
                      className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {name} <span className="text-slate-500">PM</span>
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
                  <div className="mb-1 text-xs font-medium text-slate-500">
                    {t('schedule.externalCoverage') ?? 'External Coverage'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(dayGuests.am ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        {g.name} <span className="text-slate-500">AM</span>
                      </span>
                    ))}
                    {(dayGuests.pm ?? []).map((g) => (
                      <span
                        key={g.id}
                        className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        {g.name} <span className="text-slate-500">PM</span>
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
