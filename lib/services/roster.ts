import { prisma } from '@/lib/db';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { availabilityFor } from './availability';
import { effectiveShiftFor } from './shift';

export type RosterEmployee = { empId: string; name: string };
export type RosterWarnings = string[];

export interface RosterForDateResult {
  amEmployees: RosterEmployee[];
  pmEmployees: RosterEmployee[];
  offEmployees: RosterEmployee[];
  leaveEmployees: RosterEmployee[];
  warnings: RosterWarnings;
}

export type RosterForDateOptions = { boutiqueIds?: string[] };

export async function rosterForDate(
  date: Date,
  options: RosterForDateOptions = {}
): Promise<RosterForDateResult> {
  const d = toDateOnly(date);
  const boutiqueIds = options.boutiqueIds ?? [];
  const employees = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational(boutiqueIds),
    select: { empId: true, name: true, boutiqueId: true },
    orderBy: employeeOrderByStable,
  });

  const amEmployees: RosterEmployee[] = [];
  const pmEmployees: RosterEmployee[] = [];
  const offEmployees: RosterEmployee[] = [];
  const leaveEmployees: RosterEmployee[] = [];

  for (const emp of employees) {
    const availability = await availabilityFor(emp.empId, d, emp.boutiqueId);
    if (availability === 'LEAVE') {
      leaveEmployees.push(emp);
      continue;
    }
    if (availability === 'OFF' || availability === 'HOLIDAY') {
      offEmployees.push(emp);
      continue;
    }
    const shift = await effectiveShiftFor(emp.empId, d);
    if (shift === 'MORNING') amEmployees.push(emp);
    else if (shift === 'EVENING') pmEmployees.push(emp);
    else offEmployees.push(emp);
  }

  if (process.env.DEBUG_SCHEDULE_SUGGESTIONS === '1') {
    // eslint-disable-next-line no-console
    console.log('[roster.rosterForDate]', {
      date: d.toISOString().slice(0, 10),
      boutiqueIds: options.boutiqueIds,
      amCount: amEmployees.length,
      pmCount: pmEmployees.length,
      amEmpIds: amEmployees.map((e) => e.empId),
      pmEmpIds: pmEmployees.map((e) => e.empId),
    });
  }

  const warnings: RosterWarnings = [];
  const dayOfWeek = d.getUTCDay();
  const isFriday = dayOfWeek === 5;
  if (isFriday) {
    if (amEmployees.length > 0) {
      warnings.push(`Friday is PM-only; AM count (${amEmployees.length}) must be 0`);
    }
  } else {
    if (pmEmployees.length < 2) {
      warnings.push(`PM count (${pmEmployees.length}) is below minimum 2`);
    }
    if (amEmployees.length > pmEmployees.length) {
      warnings.push(`AM (${amEmployees.length}) > PM (${pmEmployees.length}) - PM must be ≥ AM`);
    }
  }

  return {
    amEmployees,
    pmEmployees,
    offEmployees,
    leaveEmployees,
    warnings,
  };
}

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
