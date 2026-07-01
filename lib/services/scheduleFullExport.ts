/**
 * Full schedule week export (.xlsx) — data from scheduleGrid + guests + validation + audit.
 * Uses full employee names (never shortened display names).
 */

import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { filterOperationalEmployees } from '@/lib/systemUsers';
import { getScheduleGridForWeek, type GridRow } from '@/lib/services/scheduleGrid';
import { validateCoverage, formatValidationSummary } from '@/lib/services/coverageValidation';
import { getWeekStatus, isWeekLocked } from '@/lib/services/scheduleLock';
import { normalizeShiftToken } from '@/lib/schedule/shiftRules';
import type { Role } from '@prisma/client';

export type ScheduleFullExportOptions = {
  weekStart: string;
  boutiqueIds: string[];
  coveringBoutiqueName: string;
  empId?: string;
  includeAudit: boolean;
};

type GuestShiftRow = {
  id: string;
  date: string;
  empId: string;
  shift: string;
  reason?: string;
  pending?: boolean;
  sourceBoutique?: { name: string } | null;
  employee: {
    name: string;
    empId: string;
    homeBoutiqueName?: string;
  };
};

function weekDateRange(weekStart: string): { first: Date; last: Date; dates: string[] } {
  const first = new Date(weekStart + 'T00:00:00Z');
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return { first, last, dates };
}

function dayName(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long' });
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

export function shiftExportLabel(shift: string): string {
  const s = normalizeShiftToken(shift);
  switch (s) {
    case 'MORNING':
      return 'Morning (AM)';
    case 'EVENING':
      return 'Afternoon (PM)';
    case 'SPLIT':
      return 'Split Shift';
    case 'COVER_RASHID_AM':
      return 'External Coverage (AM)';
    case 'COVER_RASHID_PM':
      return 'External Coverage (PM)';
    case 'NONE':
      return '';
    default:
      return s;
  }
}

function coverageShiftLabel(shift: string): string {
  const s = normalizeShiftToken(shift);
  if (s === 'MORNING') return 'AM';
  if (s === 'EVENING') return 'PM';
  if (s === 'SPLIT') return 'Split Shift';
  return s;
}

async function fetchGuestShifts(
  weekStart: string,
  boutiqueIds: string[]
): Promise<GuestShiftRow[]> {
  const { first, last } = weekDateRange(weekStart);
  const scopeSet = new Set(boutiqueIds);

  const guestOverrides = await prisma.shiftOverride.findMany({
    where: {
      boutiqueId: { in: boutiqueIds },
      date: { gte: first, lte: last },
      isActive: true,
      overrideShift: { in: ['MORNING', 'EVENING', 'SPLIT'] },
      employee: { active: true },
    },
    select: {
      id: true,
      date: true,
      empId: true,
      overrideShift: true,
      reason: true,
      sourceBoutiqueId: true,
      employee: {
        select: {
          name: true,
          empId: true,
          boutiqueId: true,
          boutique: { select: { name: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { empId: 'asc' }],
  });

  const external = guestOverrides.filter((o) => !scopeSet.has(o.employee.boutiqueId));

  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: {
      status: 'PENDING',
      module: 'SCHEDULE',
      actionType: 'OVERRIDE_CREATE',
      boutiqueId: { in: boutiqueIds },
      weekStart: weekStartDate,
    },
    select: { id: true, payload: true },
    orderBy: { requestedAt: 'asc' },
  });

  const pendingEmpIds = Array.from(
    new Set(
      pendingRequests
        .map((r) => (r.payload as { empId?: string })?.empId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const pendingEmployees =
    pendingEmpIds.length > 0
      ? new Map(
          filterOperationalEmployees(
            await prisma.employee.findMany({
              where: { empId: { in: pendingEmpIds }, active: true },
              select: {
                empId: true,
                name: true,
                boutiqueId: true,
                isSystemOnly: true,
                boutique: { select: { name: true } },
              },
            })
          ).map((e) => [e.empId, e])
        )
      : new Map<string, { empId: string; name: string; boutiqueId: string; boutique: { name: string } | null }>();

  const pendingGuests: GuestShiftRow[] = pendingRequests.flatMap((req) => {
      const p = req.payload as {
        empId?: string;
        date?: string;
        overrideShift?: string;
        reason?: string;
      };
      const empId = String(p?.empId ?? '');
      const emp = pendingEmployees.get(empId);
      if (!emp || scopeSet.has(emp.boutiqueId)) return [];
      const shiftRaw = (p?.overrideShift ?? 'MORNING').toUpperCase();
      const shift =
        shiftRaw === 'AM' ? 'MORNING' : shiftRaw === 'PM' ? 'EVENING' : shiftRaw;
      return [
        {
          id: `pending-${req.id}`,
          date: String(p?.date ?? '').slice(0, 10),
          empId,
          shift,
          reason: p?.reason,
          pending: true,
          sourceBoutique: emp.boutique ? { name: emp.boutique.name } : null,
          employee: {
            name: emp.name,
            empId,
            homeBoutiqueName: emp.boutique?.name ?? '',
          },
        },
      ];
    });

  const applied: GuestShiftRow[] = external.map((o) => ({
    id: o.id,
    date: o.date.toISOString().slice(0, 10),
    empId: o.empId,
    shift: o.overrideShift,
    reason: o.reason ?? undefined,
    sourceBoutique: o.employee.boutique ? { name: o.employee.boutique.name } : null,
    employee: {
      name: o.employee.name,
      empId: o.employee.empId,
      homeBoutiqueName: o.employee.boutique?.name ?? '',
    },
  }));

  return [...applied, ...pendingGuests];
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF4' },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
}

function autoSizeColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    if (!col || !col.eachCell) return;
    let max = 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 52);
  });
}

function buildEmployeeScheduleRows(
  gridRows: GridRow[],
  boutiqueByEmp: Map<string, string>,
  coveringBoutiqueName: string,
  dayNamesByDate: Map<string, string>
) {
  const out: Record<string, string | boolean>[] = [];

  for (const row of gridRows) {
    const boutique = boutiqueByEmp.get(row.empId) ?? '';
    for (const cell of row.cells) {
      const shift = cell.availability === 'WORK' ? cell.effectiveShift : 'NONE';
      const normalized = normalizeShiftToken(shift);
      const isExternalCoverage =
        normalized === 'COVER_RASHID_AM' || normalized === 'COVER_RASHID_PM';
      out.push({
        Date: cell.date,
        Day: dayNamesByDate.get(cell.date) ?? dayName(cell.date),
        'Employee Name': row.name,
        'Employee ID': row.empId,
        Boutique: boutique,
        Shift: cell.availability === 'WORK' ? normalized : '',
        'Shift Label': cell.availability === 'WORK' ? shiftExportLabel(shift) : '',
        'Is Split Shift': normalized === 'SPLIT',
        'Is Leave': cell.availability === 'LEAVE',
        'Is Off Day': cell.availability === 'OFF',
        'Is External Coverage': isExternalCoverage,
        'Source Boutique': isExternalCoverage ? boutique : '',
        'Covering Boutique': isExternalCoverage ? coveringBoutiqueName : '',
        Notes:
          cell.availability === 'HOLIDAY'
            ? 'Holiday'
            : cell.availability === 'ABSENT'
              ? 'Absent'
              : '',
      });
    }
  }

  out.sort((a, b) => {
    const dateCmp = String(a.Date).localeCompare(String(b.Date));
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp =
      shiftSortKey(String(a.Shift)) - shiftSortKey(String(b.Shift));
    if (shiftCmp !== 0) return shiftCmp;
    return String(a['Employee Name']).localeCompare(String(b['Employee Name']), undefined, {
      sensitivity: 'base',
    });
  });

  return out;
}

function buildWarningRows(
  grid: Awaited<ReturnType<typeof getScheduleGridForWeek>>,
  validationsByDay: Array<{ dateStr: string; validations: Awaited<ReturnType<typeof validateCoverage>> }>,
  lockedDaySet: Set<string>,
  boutiqueName: string,
  dayNamesByDate: Map<string, string>
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const day of grid.days) {
    const dayValidations = validationsByDay.find((v) => v.dateStr === day.date)?.validations ?? [];
    for (const v of dayValidations) {
      rows.push({
        Date: day.date,
        Day: dayNamesByDate.get(day.date) ?? dayName(day.date),
        Boutique: boutiqueName,
        Category: 'Coverage',
        Message: v.message,
      });
    }
    for (const w of grid.integrityWarnings ?? []) {
      if (w.includes(day.date)) {
        rows.push({
          Date: day.date,
          Day: dayNamesByDate.get(day.date) ?? dayName(day.date),
          Boutique: boutiqueName,
          Category: 'Integrity',
          Message: w,
        });
      }
    }
    if (lockedDaySet.has(day.date)) {
      rows.push({
        Date: day.date,
        Day: dayNamesByDate.get(day.date) ?? dayName(day.date),
        Boutique: boutiqueName,
        Category: 'Lock',
        Message: 'Day locked',
      });
    }
  }
  return rows;
}

export type WeekScheduleExportData = {
  weekStart: string;
  boutiqueName: string;
  summaryRows: Record<string, string | number>[];
  employeeScheduleRows: Record<string, string | boolean>[];
  externalCoverageRows: Record<string, string>[];
  coverageCountRows: Record<string, string | number | boolean>[];
  auditRows: Record<string, string>[];
  warningRows: Record<string, string>[];
};

export async function collectWeekScheduleExportData(
  weekStart: string,
  options: {
    boutiqueIds: string[];
    coveringBoutiqueName: string;
    empId?: string;
    includeAudit: boolean;
    multiBoutique?: boolean;
  }
): Promise<WeekScheduleExportData> {
  const { boutiqueIds, coveringBoutiqueName, empId, includeAudit, multiBoutique } = options;
  const { dates: weekDates } = weekDateRange(weekStart);
  const boutiqueId = boutiqueIds[0] ?? '';

  const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds, empId });
  const guests = empId ? [] : await fetchGuestShifts(weekStart, boutiqueIds);

  const empIds = grid.rows.map((r) => r.empId);
  const employees =
    empIds.length > 0
      ? await prisma.employee.findMany({
          where: { empId: { in: empIds } },
          select: { empId: true, boutique: { select: { name: true } } },
        })
      : [];
  const boutiqueByEmp = new Map(employees.map((e) => [e.empId, e.boutique?.name ?? '']));

  const dayNamesByDate = new Map(weekDates.map((d) => [d, dayName(d)]));

  const [weekStatus, weekLocked, dayLocks, validationsByDay] = await Promise.all([
    boutiqueId ? getWeekStatus(weekStart, boutiqueId) : Promise.resolve(null),
    boutiqueId ? isWeekLocked(weekStart, boutiqueId) : Promise.resolve(false),
    boutiqueId
      ? prisma.scheduleLock.findMany({
          where: {
            scopeType: 'DAY',
            scopeValue: { in: weekDates },
            boutiqueId,
            isActive: true,
          },
          select: { scopeValue: true },
        })
      : Promise.resolve([]),
    Promise.all(
      weekDates.map(async (dateStr) => ({
        dateStr,
        validations: await validateCoverage(new Date(dateStr + 'T12:00:00Z'), { boutiqueIds }),
      }))
    ),
  ]);

  const lockedDaySet = new Set(dayLocks.map((l) => l.scopeValue));
  const statusLabel = weekLocked
    ? 'Locked'
    : weekStatus?.status === 'APPROVED'
      ? 'Approved'
      : 'Draft';

  const guestCountByDate = new Map<string, number>();
  for (const g of guests) {
    guestCountByDate.set(g.date, (guestCountByDate.get(g.date) ?? 0) + 1);
  }

  const summaryRows = grid.days.map((day, i) => {
    const count = grid.counts[i];
    const dayValidations = validationsByDay.find((v) => v.dateStr === day.date)?.validations ?? [];
    const notes: string[] = [];
    if (dayValidations.length > 0) notes.push(formatValidationSummary(dayValidations));
    const integrity = grid.integrityWarnings ?? [];
    for (const w of integrity) {
      if (w.includes(day.date)) notes.push(w);
    }
    if (lockedDaySet.has(day.date)) notes.push('Day locked');
    const row: Record<string, string | number> = {
      Date: day.date,
      Day: dayNamesByDate.get(day.date) ?? dayName(day.date),
      'AM Count': count?.amCount ?? 0,
      'PM Count': count?.pmCount ?? 0,
      'Total Coverage': guestCountByDate.get(day.date) ?? 0,
      Status: lockedDaySet.has(day.date) ? `${statusLabel} (Day Locked)` : statusLabel,
      'Notes / Warnings': notes.join('; '),
    };
    if (multiBoutique) row.Boutique = coveringBoutiqueName;
    return row;
  });

  const employeeScheduleRows = buildEmployeeScheduleRows(
    grid.rows,
    boutiqueByEmp,
    coveringBoutiqueName,
    dayNamesByDate
  );

  const externalCoverageRows = [...guests]
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const shiftCmp = shiftSortKey(a.shift) - shiftSortKey(b.shift);
      if (shiftCmp !== 0) return shiftCmp;
      return a.employee.name.localeCompare(b.employee.name, undefined, { sensitivity: 'base' });
    })
    .map((g) => ({
      Date: g.date,
      Day: dayNamesByDate.get(g.date) ?? dayName(g.date),
      'Employee Name': g.employee.name,
      'Employee ID': g.empId,
      'Home Boutique': g.employee.homeBoutiqueName ?? g.sourceBoutique?.name ?? '',
      'Covering Boutique': coveringBoutiqueName,
      Shift: coverageShiftLabel(g.shift),
      Reason: g.reason ?? '',
      Status: g.pending ? 'Pending Approval' : 'Active',
    }));

  const coverageCountRows = grid.days.map((day, i) => {
    const count = grid.counts[i];
    const dayValidations = validationsByDay.find((v) => v.dateStr === day.date)?.validations ?? [];
    const row: Record<string, string | number | boolean> = {
      Date: day.date,
      Day: dayNamesByDate.get(day.date) ?? dayName(day.date),
      'Morning AM Count': count?.amCount ?? 0,
      'Afternoon PM Count': count?.pmCount ?? 0,
      'Required AM': day.minAm,
      'Required PM': day.minPm,
      'Has Violation': dayValidations.length > 0,
      'Violation Message': dayValidations.map((v) => v.message).join('; '),
    };
    if (multiBoutique) row.Boutique = coveringBoutiqueName;
    return row;
  });

  const auditRows: Record<string, string>[] = [];
  if (includeAudit && boutiqueId) {
    const audits = await prisma.scheduleEditAudit.findMany({
      where: {
        weekStart: new Date(weekStart + 'T00:00:00Z'),
        OR: [{ boutiqueId }, { boutiqueId: null }],
      },
      orderBy: { editedAt: 'asc' },
      include: {
        editor: {
          select: {
            empId: true,
            employee: { select: { name: true } },
          },
        },
      },
    });

    const auditEmpIds = new Set<string>();
    for (const a of audits) {
      const payload = a.changesJson as {
        changes?: Array<{ empId?: string }>;
      };
      for (const ch of payload.changes ?? []) {
        if (ch.empId) auditEmpIds.add(ch.empId);
      }
    }
    const auditEmpNames =
      auditEmpIds.size > 0
        ? new Map(
            (
              await prisma.employee.findMany({
                where: { empId: { in: Array.from(auditEmpIds) } },
                select: { empId: true, name: true },
              })
            ).map((e) => [e.empId, e.name])
          )
        : new Map<string, string>();

    for (const audit of audits) {
      const editorName = audit.editor.employee?.name ?? audit.editor.empId;
      const payload = audit.changesJson as {
        changes?: Array<{
          date?: string;
          empId?: string;
          field?: string;
          before?: string;
          after?: string;
        }>;
      };
      for (const ch of payload.changes ?? []) {
        auditRows.push({
          Date: ch.date ?? '',
          Action: ch.field === 'effectiveShift' ? 'Shift Change' : (ch.field ?? 'Edit'),
          Employee: (ch.empId && auditEmpNames.get(ch.empId)) || ch.empId || '',
          'Old Value': shiftExportLabel(ch.before ?? '') || (ch.before ?? ''),
          'New Value': shiftExportLabel(ch.after ?? '') || (ch.after ?? ''),
          'Changed By': editorName,
          'Changed At': audit.editedAt.toISOString(),
          Reason: audit.source ?? '',
        });
      }
    }

    auditRows.sort((a, b) => {
      const dateCmp = String(a.Date).localeCompare(String(b.Date));
      if (dateCmp !== 0) return dateCmp;
      return String(a['Changed At']).localeCompare(String(b['Changed At']));
    });
  }

  const warningRows = buildWarningRows(
    grid,
    validationsByDay,
    lockedDaySet,
    coveringBoutiqueName,
    dayNamesByDate
  );

  return {
    weekStart,
    boutiqueName: coveringBoutiqueName,
    summaryRows,
    employeeScheduleRows,
    externalCoverageRows,
    coverageCountRows,
    auditRows,
    warningRows,
  };
}

export function addSheetFromRows(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Record<string, string | number | boolean>[]
) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ''));
  }
  styleHeaderRow(sheet);
  autoSizeColumns(sheet);
  return sheet;
}

export async function buildScheduleFullExportWorkbook(
  options: ScheduleFullExportOptions
): Promise<{ buffer: ArrayBuffer; weekEnd: string }> {
  const { weekStart, boutiqueIds, coveringBoutiqueName, empId, includeAudit } = options;
  const { dates: weekDates } = weekDateRange(weekStart);
  const weekEnd = weekDates[6]!;

  const weekData = await collectWeekScheduleExportData(weekStart, {
    boutiqueIds,
    coveringBoutiqueName,
    empId,
    includeAudit,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Monitor';
  workbook.created = new Date();

  addSheetFromRows(workbook, 'Weekly Summary', [
    'Date',
    'Day',
    'AM Count',
    'PM Count',
    'Total Coverage',
    'Status',
    'Notes / Warnings',
  ], weekData.summaryRows);

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
  ], weekData.employeeScheduleRows);

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
  ], weekData.externalCoverageRows);

  addSheetFromRows(workbook, 'Coverage Counts', [
    'Date',
    'Day',
    'Morning AM Count',
    'Afternoon PM Count',
    'Required AM',
    'Required PM',
    'Has Violation',
    'Violation Message',
  ], weekData.coverageCountRows);

  if (weekData.auditRows.length > 0) {
    addSheetFromRows(workbook, 'Audit Changes', [
      'Date',
      'Action',
      'Employee',
      'Old Value',
      'New Value',
      'Changed By',
      'Changed At',
      'Reason',
    ], weekData.auditRows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, weekEnd };
}

export function canExportScheduleAudit(role: Role): boolean {
  return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'AREA_MANAGER';
}
