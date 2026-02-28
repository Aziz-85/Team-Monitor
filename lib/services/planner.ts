import { prisma } from '@/lib/db';
import { notDisabledUserWhere } from '@/lib/employeeWhere';
import { tasksRunnableOnDate, assignTaskOnDate } from './tasks';
import { availabilityFor } from './availability';
import { effectiveShiftFor } from './shift';

export interface PlannerRow {
  Title: string;
  AssignedTo: string;
  'Start Date': string;
  'Due Date': string;
  Notes: string;
}

export interface ScheduleExportFilters {
  boutiqueOnly?: boolean;
  rashidOnly?: boolean;
}

/** Schedule-based rows for Planner: [Boutique] Morning/Evening Shift – date, [Rashid] AM/PM Coverage – date. */
export async function schedulePlannerRows(
  from: Date,
  to: Date,
  filters: ScheduleExportFilters = {},
  boutiqueId?: string
): Promise<PlannerRow[]> {
  const { boutiqueOnly = false, rashidOnly = false } = filters;
  const includeBoutique = boutiqueOnly || (!boutiqueOnly && !rashidOnly);
  const includeRashid = rashidOnly || (!boutiqueOnly && !rashidOnly);

  const employeeWhere = {
    active: true,
    isSystemOnly: false,
    ...notDisabledUserWhere,
    ...(boutiqueId ? { boutiqueId } : {}),
  };
  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { empId: true, name: true },
  });

  const rows: PlannerRow[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const am: string[] = [];
    const pm: string[] = [];
    const rashidAm: string[] = [];
    const rashidPm: string[] = [];

    for (const emp of employees) {
      const availability = await availabilityFor(emp.empId, cur);
      if (availability !== 'WORK') continue;
      const shift = await effectiveShiftFor(emp.empId, cur);
      if (shift === 'MORNING') am.push(emp.name);
      else if (shift === 'EVENING') pm.push(emp.name);
      else if (shift === 'COVER_RASHID_AM') rashidAm.push(emp.name);
      else if (shift === 'COVER_RASHID_PM') rashidPm.push(emp.name);
    }

    if (includeBoutique) {
      if (am.length > 0) {
        rows.push({
          Title: `[Boutique] Morning Shift – ${dateStr}`,
          AssignedTo: am.join(', '),
          'Start Date': dateStr,
          'Due Date': dateStr,
          Notes: 'Boutique AM',
        });
      }
      if (pm.length > 0) {
        rows.push({
          Title: `[Boutique] Evening Shift – ${dateStr}`,
          AssignedTo: pm.join(', '),
          'Start Date': dateStr,
          'Due Date': dateStr,
          Notes: 'Boutique PM',
        });
      }
    }
    if (includeRashid) {
      if (rashidAm.length > 0) {
        rows.push({
          Title: `[Rashid] Morning Coverage – ${dateStr}`,
          AssignedTo: rashidAm.join(', '),
          'Start Date': dateStr,
          'Due Date': dateStr,
          Notes: 'Rashid AM',
        });
      }
      if (rashidPm.length > 0) {
        rows.push({
          Title: `[Rashid] Evening Coverage – ${dateStr}`,
          AssignedTo: rashidPm.join(', '),
          'Start Date': dateStr,
          'Due Date': dateStr,
          Notes: 'Rashid PM',
        });
      }
    }

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return rows;
}

function dateToYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function iterateDates(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function plannerRows(from: Date, to: Date, boutiqueId?: string): Promise<PlannerRow[]> {
  const tasks = await prisma.task.findMany({
    where: { active: true, ...(boutiqueId ? { boutiqueId } : {}) },
    include: {
      taskSchedules: true,
      taskPlans: {
        include: {
          primary: { select: { empId: true, name: true } },
          backup1: { select: { empId: true, name: true } },
          backup2: { select: { empId: true, name: true } },
        },
      },
    },
  });

  const rows: PlannerRow[] = [];
  const dates = iterateDates(from, to);

  for (const date of dates) {
    const dateStr = dateToYMD(date);
    for (const task of tasks) {
      if (!tasksRunnableOnDate(task, date)) continue;
      const assignment = await assignTaskOnDate(task, date);
      const title = `${task.name} (${dateStr})`;
      const assignedTo = assignment.assignedName ?? assignment.assignedEmpId ?? 'Unassigned';
      const notes = assignment.reason === 'UNASSIGNED'
        ? `Unassigned. ${assignment.reasonNotes.join('; ')}`
        : `${assignment.reason}. ${assignment.reasonNotes.join('; ')}`;
      rows.push({
        Title: title,
        AssignedTo: assignedTo,
        'Start Date': dateStr,
        'Due Date': dateStr,
        Notes: notes,
      });
    }
  }

  return rows;
}

export function plannerRowsToCSV(rows: PlannerRow[]): string {
  const header = ['Title', 'AssignedTo', 'Start Date', 'Due Date', 'Notes'];
  const escape = (s: string) => {
    const t = String(s);
    if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const lines = [header.map(escape).join(',')];
  for (const r of rows) {
    lines.push([r.Title, r.AssignedTo, r['Start Date'], r['Due Date'], r.Notes].map(escape).join(','));
  }
  return lines.join('\r\n');
}
