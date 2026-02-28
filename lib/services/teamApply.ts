/**
 * Sprint 2B: Extracted apply function for team change.
 * Used by approval flow and by direct mutation. Locks/validations/logAudit preserved.
 */

import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getWeekStart, isWeekLocked, isDayLocked } from '@/lib/services/scheduleLock';
import { getEmployeeTeam } from '@/lib/services/employeeTeam';
import type { Team } from '@prisma/client';

export type TeamChangePayload = {
  empId: string;
  newTeam: string;
  effectiveFrom: string;
  reason: string;
};

/**
 * Apply a single team change. Caller must have validated empId/body.
 * Throws if locked or validation fails.
 */
export async function applyTeamChange(
  payload: TeamChangePayload,
  actorUserId: string
): Promise<{ ok: true; empId: string; previousTeam: string; newTeam: string; effectiveFrom: string }> {
  const { empId, newTeam: rawTeam, effectiveFrom: effectiveFromStr, reason } = payload;
  const newTeam = rawTeam.toUpperCase() as Team;
  if (newTeam !== 'A' && newTeam !== 'B') {
    throw new Error('newTeam must be A or B');
  }

  const effectiveFrom = new Date(effectiveFromStr + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (effectiveFrom.getTime() < today.getTime()) {
    throw new Error('effectiveFrom must be today or a future date');
  }

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, name: true, boutiqueId: true },
  });
  if (!employee) {
    throw new Error('Employee not found');
  }

  const weekStart = getWeekStart(effectiveFrom);
  if (await isWeekLocked(weekStart, employee.boutiqueId)) {
    throw new Error('WEEK_LOCKED');
  }
  if (await isDayLocked(effectiveFrom, employee.boutiqueId)) {
    throw new Error('DAY_LOCKED');
  }

  let currentTeam: string;
  try {
    // Use a single source of truth for "current team as of today"
    // so that Employees table, Change Team modal, and backend
    // validations all agree on the baseline team.
    currentTeam = await getEmployeeTeam(empId, today);
  } catch {
    throw new Error('Employee not found');
  }

  if (currentTeam === newTeam) {
    throw new Error('No change: team is already ' + newTeam);
  }

  const [latestAssignment, latestHistory] = await Promise.all([
    prisma.employeeTeamAssignment.findFirst({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    }),
    prisma.employeeTeamHistory.findFirst({
      where: { empId },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    }),
  ]);
  const lastEffective = [latestAssignment?.effectiveFrom, latestHistory?.effectiveFrom]
    .filter(Boolean)
    .map((d) => new Date(d!))
    .map((d) => (d.setUTCHours(0, 0, 0, 0), d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastEffective && effectiveFrom.getTime() <= lastEffective.getTime()) {
    throw new Error('effectiveFrom must be after the last team change date');
  }

  await prisma.employeeTeamAssignment.create({
    data: {
      empId,
      team: newTeam,
      effectiveFrom,
      reason,
      createdByUserId: actorUserId,
    },
  });

  await logAudit(
    actorUserId,
    'TEAM_CHANGE_CREATED',
    'Employee',
    empId,
    JSON.stringify({ oldTeam: currentTeam }),
    JSON.stringify({ newTeam, effectiveFrom: effectiveFromStr }),
    reason,
    { module: 'TEAM', targetEmployeeId: empId, targetDate: effectiveFromStr }
  );

  return {
    ok: true,
    empId,
    previousTeam: currentTeam,
    newTeam,
    effectiveFrom: effectiveFromStr,
  };
}
