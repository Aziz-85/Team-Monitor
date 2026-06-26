'use client';

/** Uses same row height (38px) and text-sm as schedule table tokens in lib/scheduleUi */
import { Fragment } from 'react';
import { getEmployeeDisplayName } from '@/lib/employees/getEmployeeDisplayName';
import { contributesToMorningList, contributesToEveningList, isSplitShift } from '@/lib/schedule/shiftRules';
import {
  buildScheduleDisplayNames,
  formatScheduleNameSlot,
  type ScheduleSlotLabel,
} from '@/lib/schedule/displayName';
import type { CoverageItem } from '@/lib/schedule/coverageItems';
import { CoverageCell } from '@/components/schedule/CoverageCell';
import type { CoverageTooltipLabels } from '@/lib/schedule/coverageItems';
import { ScheduleSlotLabelSpan } from '@/components/schedule/ScheduleSlotLabel';

type GridDay = { date: string; dayName?: string; dayOfWeek: number };
type GridRow = { empId: string; name: string; nameAr?: string | null; team: string; cells: Array<{ date: string; availability: string; effectiveShift: string }> };
type GridData = { days: GridDay[]; rows: GridRow[]; counts?: Array<{ amCount: number; pmCount: number }> };

export type CoverageByDayMobile = Record<string, CoverageItem[]>;

type ListedName = { key: string; label: ScheduleSlotLabel };

function renderNameList(items: ListedName[]) {
  return items.map((item, idx) => (
    <Fragment key={item.key}>
      {idx > 0 ? ', ' : null}
      <ScheduleSlotLabelSpan label={item.label} />
    </Fragment>
  ));
}

export function ScheduleMobileView({
  gridData,
  displayNameMap,
  coverageByDay = {},
  coverageHeaderLabel,
  coverageTooltipLabels,
  formatDDMM,
  getDayName,
  t,
  locale = 'en',
}: {
  gridData: GridData;
  displayNameMap?: Map<string, string>;
  coverageByDay?: CoverageByDayMobile;
  coverageHeaderLabel?: string;
  coverageTooltipLabels?: Partial<CoverageTooltipLabels>;
  formatDDMM: (d: string) => string;
  getDayName: (d: string, locale: string) => string;
  t: (k: string) => string;
  locale?: string;
}) {
  const { days, rows } = gridData;
  const nameMap = displayNameMap;
  const coverageLabel = coverageHeaderLabel ?? (t('schedule.externalCoverage') ?? 'External Coverage');
  const dayCards = days.map((day, i) => {
    const dayEmployees: Array<{ empId: string; name: string }> = [];
    const morning: ListedName[] = [];
    const evening: ListedName[] = [];
    const isFridayDay = day.dayOfWeek === 5;

    for (const row of rows) {
      const cell = row.cells[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const fullName = getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale);
      dayEmployees.push({ empId: row.empId, name: fullName });
    }

    const dayMap = nameMap ?? buildScheduleDisplayNames(dayEmployees);

    for (const row of rows) {
      const cell = row.cells[i];
      if (!cell || cell.availability !== 'WORK') continue;
      const fullName = getEmployeeDisplayName({ name: row.name, nameAr: row.nameAr }, locale);
      const split = isSplitShift(cell.effectiveShift);
      const slotLabel = formatScheduleNameSlot(
        { empId: row.empId, fullName, isSplit: split },
        dayMap
      );
      const listed = { key: row.empId, label: slotLabel };
      if (contributesToMorningList(cell.effectiveShift, isFridayDay)) morning.push(listed);
      if (contributesToEveningList(cell.effectiveShift)) evening.push(listed);
    }

    return {
      date: day.date,
      dayName: day.dayName ?? getDayName(day.date, locale),
      morning,
      evening,
      coverage: coverageByDay[day.date] ?? [],
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
            {card.coverage.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">{coverageLabel}</div>
                <CoverageCell
                  coverageItems={card.coverage}
                  displayNameMap={nameMap}
                  tooltipLabels={coverageTooltipLabels}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
