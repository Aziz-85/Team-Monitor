/**
 * Schedule Export Center — multi-week / range / month Excel export.
 * Data from scheduleGrid + guests + validation + audit (never HTML).
 */

import ExcelJS from 'exceljs';
import { getWeekStartSaturday } from '@/lib/utils/week';
import {
  addSheetFromRows,
  collectWeekScheduleExportData,
} from '@/lib/services/scheduleFullExport';
import { normalizeShiftToken } from '@/lib/schedule/shiftRules';

export type ScheduleReportExportType = 'week' | 'range' | 'month';

export type ScheduleReportExportOptions = {
  type: ScheduleReportExportType;
  weekStart?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
  boutiqueIds: string[];
  boutiqueLabelsById: Map<string, string>;
  empId?: string;
  includeEmployeeSchedule: boolean;
  includeExternalCoverage: boolean;
  includeCoverageCounts: boolean;
  includeAudit: boolean;
  includeWarnings: boolean;
  includeSplitShifts: boolean;
};

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekDateRange(weekStart: string): string[] {
  const first = new Date(weekStart + 'T00:00:00Z');
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toYmd(d));
  }
  return dates;
}

function getWeekStartForDate(dateStr: string): string {
  const start = getWeekStartSaturday(new Date(dateStr + 'T12:00:00Z'));
  return toYmd(start);
}

function getDatesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const d = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (d.getTime() <= end.getTime()) {
    out.push(toYmd(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function getWeekStartsInRange(startDate: string, endDate: string): string[] {
  const set = new Set<string>();
  for (const d of getDatesInRange(startDate, endDate)) {
    set.add(getWeekStartForDate(d));
  }
  return Array.from(set).sort();
}

export function resolveScheduleReportDateRange(options: {
  type: ScheduleReportExportType;
  weekStart?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
}): { startDate: string; endDate: string } | { error: string } {
  const { type } = options;
  if (type === 'week') {
    const ws = options.weekStart?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) {
      return { error: 'weekStart required (YYYY-MM-DD)' };
    }
    const dates = weekDateRange(ws);
    return { startDate: dates[0]!, endDate: dates[6]! };
  }
  if (type === 'month') {
    const month = options.month?.trim() ?? '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { error: 'month required (YYYY-MM)' };
    }
    const [y, m] = month.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m, 0));
    return { startDate, endDate: toYmd(last) };
  }
  const startDate = options.startDate?.trim() ?? '';
  const endDate = options.endDate?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: 'startDate and endDate required (YYYY-MM-DD)' };
  }
  if (startDate > endDate) {
    return { error: 'startDate must be on or before endDate' };
  }
  return { startDate, endDate };
}

function shiftSortKey(shift: string): number {
  const s = normalizeShiftToken(shift);
  if (s === 'MORNING') return 1;
  if (s === 'EVENING') return 2;
  if (s === 'SPLIT') return 3;
  if (s === 'COVER_RASHID_AM') return 4;
  if (s === 'COVER_RASHID_PM') return 5;
  return 99;
}

function filterByDateRange<T extends Record<string, string | number | boolean>>(
  rows: T[],
  startDate: string,
  endDate: string
): T[] {
  return rows.filter((r) => {
    const d = String(r.Date ?? '');
    return d >= startDate && d <= endDate;
  });
}

function sortEmployeeRows(rows: Record<string, string | boolean>[]) {
  rows.sort((a, b) => {
    const dateCmp = String(a.Date).localeCompare(String(b.Date));
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp = shiftSortKey(String(a.Shift)) - shiftSortKey(String(b.Shift));
    if (shiftCmp !== 0) return shiftCmp;
    return String(a['Employee Name']).localeCompare(String(b['Employee Name']), undefined, {
      sensitivity: 'base',
    });
  });
}

function sortExternalRows(rows: Record<string, string>[]) {
  rows.sort((a, b) => {
    const dateCmp = String(a.Date).localeCompare(String(b.Date));
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp = shiftSortKey(String(a.Shift)) - shiftSortKey(String(b.Shift));
    if (shiftCmp !== 0) return shiftCmp;
    return String(a['Employee Name']).localeCompare(String(b['Employee Name']), undefined, {
      sensitivity: 'base',
    });
  });
}

function sortByDate(rows: Array<Record<string, string | number | boolean>>) {
  rows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
}

export async function buildScheduleReportExportWorkbook(
  options: ScheduleReportExportOptions
): Promise<{ buffer: ArrayBuffer; startDate: string; endDate: string }> {
  const range = resolveScheduleReportDateRange({
    type: options.type,
    weekStart: options.weekStart,
    startDate: options.startDate,
    endDate: options.endDate,
    month: options.month,
  });
  if ('error' in range) throw new Error(range.error);

  const { startDate, endDate } = range;
  const weekStarts = getWeekStartsInRange(startDate, endDate);
  const multiBoutique = options.boutiqueIds.length > 1;

  let summaryRows: Record<string, string | number>[] = [];
  let employeeScheduleRows: Record<string, string | boolean>[] = [];
  const externalCoverageRows: Record<string, string>[] = [];
  const coverageCountRows: Record<string, string | number | boolean>[] = [];
  const auditRows: Record<string, string>[] = [];
  const warningRows: Record<string, string>[] = [];

  for (const boutiqueId of options.boutiqueIds) {
    const coveringBoutiqueName =
      options.boutiqueLabelsById.get(boutiqueId) ?? boutiqueId;

    for (const weekStart of weekStarts) {
      const weekData = await collectWeekScheduleExportData(weekStart, {
        boutiqueIds: [boutiqueId],
        coveringBoutiqueName,
        empId: options.empId,
        includeAudit: options.includeAudit,
        multiBoutique,
      });

      summaryRows.push(...filterByDateRange(weekData.summaryRows, startDate, endDate));
      employeeScheduleRows.push(
        ...filterByDateRange(weekData.employeeScheduleRows, startDate, endDate)
      );
      externalCoverageRows.push(
        ...filterByDateRange(weekData.externalCoverageRows, startDate, endDate)
      );
      coverageCountRows.push(
        ...filterByDateRange(weekData.coverageCountRows, startDate, endDate)
      );
      auditRows.push(...filterByDateRange(weekData.auditRows, startDate, endDate));
      warningRows.push(...filterByDateRange(weekData.warningRows, startDate, endDate));
    }
  }

  sortByDate(summaryRows);
  sortEmployeeRows(employeeScheduleRows);
  sortExternalRows(externalCoverageRows);
  sortByDate(coverageCountRows);
  auditRows.sort((a, b) => {
    const dateCmp = String(a.Date).localeCompare(String(b.Date));
    if (dateCmp !== 0) return dateCmp;
    return String(a['Changed At']).localeCompare(String(b['Changed At']));
  });
  sortByDate(warningRows);

  if (!options.includeSplitShifts) {
    employeeScheduleRows = employeeScheduleRows.filter((r) => r['Is Split Shift'] !== true);
  }

  if (!options.includeWarnings) {
    summaryRows = summaryRows.map((r) => ({ ...r, 'Notes / Warnings': '' }));
  }

  const summaryHeaders = multiBoutique
    ? [
        'Date',
        'Day',
        'Boutique',
        'AM Count',
        'PM Count',
        'Total Coverage',
        'Status',
        ...(options.includeWarnings ? ['Notes / Warnings'] : []),
      ]
    : [
        'Date',
        'Day',
        'AM Count',
        'PM Count',
        'Total Coverage',
        'Status',
        ...(options.includeWarnings ? ['Notes / Warnings'] : []),
      ];

  const coverageHeaders = multiBoutique
    ? [
        'Date',
        'Day',
        'Boutique',
        'Morning AM Count',
        'Afternoon PM Count',
        'Required AM',
        'Required PM',
        'Has Violation',
        'Violation Message',
      ]
    : [
        'Date',
        'Day',
        'Morning AM Count',
        'Afternoon PM Count',
        'Required AM',
        'Required PM',
        'Has Violation',
        'Violation Message',
      ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Monitor';
  workbook.created = new Date();

  addSheetFromRows(workbook, 'Summary', summaryHeaders, summaryRows);

  if (options.includeEmployeeSchedule) {
    addSheetFromRows(workbook, 'Employee Schedule', [
      'Date',
      'Day',
      'Employee Name',
      'Employee ID',
      'Boutique',
      'Shift',
      'Shift Label',
      'Is Split Shift',
      'Is Leave',
      'Is Off Day',
      'Is External Coverage',
      'Source Boutique',
      'Covering Boutique',
      'Notes',
    ], employeeScheduleRows);
  }

  if (options.includeExternalCoverage) {
    addSheetFromRows(workbook, 'External Coverage', [
      'Date',
      'Day',
      'Employee Name',
      'Employee ID',
      'Home Boutique',
      'Covering Boutique',
      'Shift',
      'Reason',
      'Status',
    ], externalCoverageRows);
  }

  if (options.includeCoverageCounts) {
    addSheetFromRows(workbook, 'Coverage Counts', coverageHeaders, coverageCountRows);
  }

  if (options.includeAudit && auditRows.length > 0) {
    addSheetFromRows(workbook, 'Audit Changes', [
      'Date',
      'Action',
      'Employee',
      'Old Value',
      'New Value',
      'Changed By',
      'Changed At',
      'Reason',
    ], auditRows);
  }

  if (options.includeWarnings && warningRows.length > 0) {
    addSheetFromRows(workbook, 'Warnings', [
      'Date',
      'Day',
      'Boutique',
      'Category',
      'Message',
    ], warningRows);
  }


  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, startDate, endDate };
}
