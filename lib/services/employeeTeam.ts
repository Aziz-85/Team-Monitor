/**
 * Team resolution by effective date (non-retroactive).
 * All schedule/base-shift logic must use getEmployeeTeam(empId, date) instead of employee.team.
 * Order: EmployeeTeamAssignment → EmployeeTeamHistory → Employee.team (seed fallback).
 */

import { prisma } from '@/lib/db';

/**
 * Returns the effective team for an employee on a given date.
 * Uses the latest EmployeeTeamAssignment where effectiveFrom <= date;
 * then EmployeeTeamHistory; then employee.team as initial seed fallback.
 */
export async function getEmployeeTeam(
  empId: string,
  date: Date
): Promise<'A' | 'B'> {
  const dateOnly = toDateOnly(date);

  const assignment = await prisma.employeeTeamAssignment.findFirst({
    where: {
      empId,
      effectiveFrom: { lte: dateOnly },
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { team: true },
  });
  if (assignment) return assignment.team as 'A' | 'B';

  const history = await prisma.employeeTeamHistory.findFirst({
    where: {
      empId,
      effectiveFrom: { lte: dateOnly },
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { team: true },
  });
  if (history) return history.team as 'A' | 'B';

  const emp = await prisma.employee.findUnique({
    where: { empId },
    select: { team: true },
  });
  if (emp) return emp.team as 'A' | 'B';

  throw new Error(`Employee not found: ${empId}`);
}

/**
 * Returns team per (empId, date) for the given employees and date range.
 * Resolution order per date: Assignment → History → Employee.team.
 */
export async function getEmployeeTeamsForDateRange(
  empIds: string[],
  startDate: Date,
  endDate: Date
): Promise<Map<string, Map<string, 'A' | 'B'>>> {
  const result = new Map<string, Map<string, 'A' | 'B'>>();
  for (const empId of empIds) {
    result.set(empId, new Map());
  }

  if (empIds.length === 0) return result;

  const endDateOnly = toDateOnly(endDate);

  const [assignments, history] = await Promise.all([
    prisma.employeeTeamAssignment.findMany({
      where: {
        empId: { in: empIds },
        effectiveFrom: { lte: endDateOnly },
      },
      orderBy: [{ empId: 'asc' }, { effectiveFrom: 'desc' }],
      select: { empId: true, team: true, effectiveFrom: true },
    }),
    prisma.employeeTeamHistory.findMany({
      where: {
        empId: { in: empIds },
        effectiveFrom: { lte: endDateOnly },
      },
      orderBy: [{ empId: 'asc' }, { effectiveFrom: 'desc' }],
      select: { empId: true, team: true, effectiveFrom: true },
    }),
  ]);

  const employees = await prisma.employee.findMany({
    where: { empId: { in: empIds } },
    select: { empId: true, team: true },
  });
  const fallbackTeam = new Map(employees.map((e) => [e.empId, e.team as 'A' | 'B']));

  const dateStrs: string[] = [];
  const d = new Date(toDateOnly(startDate));
  const end = toDateOnly(endDate).getTime();
  while (d.getTime() <= end) {
    dateStrs.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  for (const empId of empIds) {
    const byDate = result.get(empId)!;
    const empAssignments = assignments.filter((a) => a.empId === empId);
    const empHistory = history.filter((h) => h.empId === empId);
    const defaultTeam = fallbackTeam.get(empId);

    for (const dateStr of dateStrs) {
      const date = new Date(dateStr + 'T00:00:00Z');
      const dateMs = toDateOnly(date).getTime();

      const assignment = empAssignments.find((a) => toDateOnly(a.effectiveFrom).getTime() <= dateMs);
      if (assignment) {
        byDate.set(dateStr, assignment.team as 'A' | 'B');
        continue;
      }
      const historyRecord = empHistory.find((h) => toDateOnly(h.effectiveFrom).getTime() <= dateMs);
      if (historyRecord) {
        byDate.set(dateStr, historyRecord.team as 'A' | 'B');
      } else if (defaultTeam) {
        byDate.set(dateStr, defaultTeam);
      }
    }
  }

  return result;
}

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
