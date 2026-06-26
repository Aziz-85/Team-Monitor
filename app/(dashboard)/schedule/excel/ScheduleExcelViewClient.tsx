'use client';

import { Fragment, useMemo } from 'react';
import { getSlotColumnClass } from '@/lib/schedule/scheduleSlots';
import {
  formatScheduleNameSlot,
  type ScheduleNameSlot,
} from '@/lib/schedule/displayName';
import type { CoverageItem } from '@/lib/schedule/coverageItems';
import { SCHEDULE_UI, SCHEDULE_COLS } from '@/lib/scheduleUi';
import { CoverageCell } from '@/components/schedule/CoverageCell';
import type { CoverageTooltipLabels } from '@/lib/schedule/coverageItems';
import { ScheduleSlotLabelSpan } from '@/components/schedule/ScheduleSlotLabel';

export type ExcelClassicGridData = {
  days: Array<{ date: string; dayName?: string }>;
  counts: Array<{ amCount: number; pmCount: number }>;
};

export type ExcelClassicExcelData = {
  morningByDay: ScheduleNameSlot[][];
  eveningByDay: ScheduleNameSlot[][];
  rashidAmByDay: ScheduleNameSlot[][];
  rashidPmByDay: ScheduleNameSlot[][];
};

export type CoverageByDayExcel = Record<string, CoverageItem[]>;

function slotAt(slots: ScheduleNameSlot[], index: number): ScheduleNameSlot | undefined {
  return slots[index];
}

export function ScheduleExcelViewClient({
  gridData,
  excelData,
  displayNameMap,
  coverageByDay = {},
  coverageHeaderLabel,
  coverageTooltipLabels,
  visibleSlots,
  maxPerCell,
  showMaxColumnsWarning,
  formatDDMM,
  getDayName,
  getDayShort,
  t,
}: {
  gridData: ExcelClassicGridData;
  excelData: ExcelClassicExcelData;
  displayNameMap: Map<string, string>;
  coverageByDay?: CoverageByDayExcel;
  coverageHeaderLabel?: string;
  coverageTooltipLabels?: Partial<CoverageTooltipLabels>;
  visibleSlots: number;
  maxPerCell: number;
  showMaxColumnsWarning?: boolean;
  formatDDMM: (d: string) => string;
  getDayName: (d: string) => string;
  getDayShort?: (d: string) => string;
  t: (k: string) => string;
}) {
  const { days, counts } = gridData;
  const { morningByDay, eveningByDay } = excelData;
  const slotExtra = getSlotColumnClass(visibleSlots);
  const showWarning = showMaxColumnsWarning && maxPerCell > 6;
  const dayShort = (d: string) => (getDayShort ? getDayShort(d) : getDayName(d).slice(0, 3));
  const coverageLabel = coverageHeaderLabel ?? (t('schedule.externalCoverage') ?? 'External Coverage');

  /** أعمدة فارغة طوال الأسبوع (كل الخلايا شرطة) تُعطى عرضاً ضيقاً بحجم الشرطة فقط */
  const { emptyMorningSlots, emptyEveningSlots } = useMemo(() => {
    const emptyM = Array.from({ length: visibleSlots }, (_, i) =>
      days.every((_, dayIdx) => !slotAt(morningByDay[dayIdx] ?? [], i))
    );
    const emptyE = Array.from({ length: visibleSlots }, (_, i) =>
      days.every((_, dayIdx) => !slotAt(eveningByDay[dayIdx] ?? [], i))
    );
    return { emptyMorningSlots: emptyM, emptyEveningSlots: emptyE };
  }, [days, morningByDay, eveningByDay, visibleSlots]);

  const cellDate = `${SCHEDULE_UI.dateCell} ${SCHEDULE_UI.borderL2} text-center`;
  const headerCell = `${SCHEDULE_UI.headerCell} text-center`;
  const headerDate = `${headerCell} ${SCHEDULE_UI.borderL2} ${SCHEDULE_COLS.dateExcel}`;
  const headerDayEnd = `${headerCell} border-r-2 border-border ${SCHEDULE_COLS.dateExcel}`;
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
  const rashidCell = `${SCHEDULE_UI.coverageCell} ${SCHEDULE_UI.borderL2} text-start`;
  const amCountCell = `${SCHEDULE_UI.amCountCell} ${SCHEDULE_UI.borderL2}`;
  const pmCountCell = `${SCHEDULE_UI.pmCountCell} ${SCHEDULE_UI.borderL2}`;

  const renderSlotNames = (slots: ScheduleNameSlot[]) =>
    slots.map((slot, idx) => {
      const label = formatScheduleNameSlot(slot, displayNameMap);
      return (
        <Fragment key={`${slot.empId}-${idx}`}>
          {idx > 0 ? ', ' : null}
          <ScheduleSlotLabelSpan label={label} />
        </Fragment>
      );
    });

  return (
    <>
      {/* Mobile: stacked cards per day (no horizontal scroll) */}
      <div className="space-y-3 md:hidden" dir="ltr">
        {days.map((day) => {
          const dayIdx = days.findIndex((d) => d.date === day.date);
          const morning = morningByDay[dayIdx] ?? [];
          const evening = eveningByDay[dayIdx] ?? [];
          const dayCoverage = coverageByDay[day.date] ?? [];
          const amCount = counts[dayIdx]?.amCount ?? 0;
          const pmCount = counts[dayIdx]?.pmCount ?? 0;
          return (
            <div
              key={day.date}
              className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden"
            >
              <div className="border-b border-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-foreground">
                {formatDDMM(day.date)} — {getDayName(day.date)}
              </div>
              <div className="px-3 py-2 space-y-2 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted mb-1">{t('schedule.morning')}</div>
                  <div className="bg-blue-50 rounded border border-blue-200 px-2 py-1.5 text-blue-900 min-h-[2.25rem]">
                    {morning.length > 0 ? renderSlotNames(morning) : null}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{t('schedule.amCount')}: {amCount}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted mb-1">{t('schedule.evening')}</div>
                  <div className="bg-amber-50 rounded border border-amber-200 px-2 py-1.5 text-amber-900 min-h-[2.25rem]">
                    {evening.length > 0 ? renderSlotNames(evening) : null}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{t('schedule.pmCount')}: {pmCount}</div>
                </div>
                {dayCoverage.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted mb-1">{coverageLabel}</div>
                    <CoverageCell
                      coverageItems={dayCoverage}
                      displayNameMap={displayNameMap}
                      tooltipLabels={coverageTooltipLabels}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table, no horizontal scroll */}
      {showWarning && (
        <p className="hidden md:block mb-1 text-xs text-amber-700" role="status">
          {t('schedule.maxColumnsReachedWarning')}
        </p>
      )}
      <div className="hidden md:block" dir="ltr">
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
            const morning = morningByDay[dayIdx] ?? [];
            const evening = eveningByDay[dayIdx] ?? [];
            const dayCoverage = coverageByDay[day.date] ?? [];
            const amCount = counts[dayIdx]?.amCount ?? 0;
            const pmCount = counts[dayIdx]?.pmCount ?? 0;
            return (
              <tr key={day.date}>
                <td className={`${cellDate} border-r-2 border-border`} title={formatDDMM(day.date)}>{formatDDMM(day.date)}</td>
                <td className={`${SCHEDULE_UI.dayCell} border-r-2 border-border whitespace-nowrap min-w-0 text-center`} dir="auto" title={getDayName(day.date)}>
                  {dayShort(day.date)}
                </td>
                {Array.from({ length: visibleSlots }, (_, i) => {
                  const slot = slotAt(morning, i);
                  const label = slot ? formatScheduleNameSlot(slot, displayNameMap) : null;
                  return (
                    <td key={i} className={`${i === 0 ? morningFirst : i === visibleSlots - 1 ? morningLast : morningCell} ${slotExtra} ${emptyMorningSlots[i] ? 'w-[2rem] min-w-0 max-w-[2rem]' : ''}`} title={label?.title}>
                      <span className="block truncate text-start">{label ? <ScheduleSlotLabelSpan label={label} /> : null}</span>
                    </td>
                  );
                })}
                {Array.from({ length: visibleSlots }, (_, i) => {
                  const slot = slotAt(evening, i);
                  const label = slot ? formatScheduleNameSlot(slot, displayNameMap) : null;
                  return (
                    <td key={i} className={`${i === 0 ? eveningFirst : i === visibleSlots - 1 ? eveningLast : eveningCell} ${slotExtra} ${emptyEveningSlots[i] ? 'w-[2rem] min-w-0 max-w-[2rem]' : ''}`} title={label?.title}>
                      <span className="block truncate text-start">{label ? <ScheduleSlotLabelSpan label={label} /> : null}</span>
                    </td>
                  );
                })}
                <td className={rashidCell}>
                  <CoverageCell
                    coverageItems={dayCoverage}
                    displayNameMap={displayNameMap}
                    tooltipLabels={coverageTooltipLabels}
                  />
                </td>
                <td className={amCountCell}>{amCount}</td>
                <td className={pmCountCell}>{pmCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
