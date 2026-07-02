/**
 * Shared loader for Schedule Engine v3 APIs (solve, analyze).
 */

import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { loadFairnessContext, buildEmployeeFairness } from '@/lib/services/schedulePlannerFairness';
import { loadWeekGuestShifts } from '@/lib/services/schedulePlanGuests';
import { getRamadanRange } from '@/lib/time/ramadan';
import { buildGenerateScheduleInput } from '@/lib/schedule/generateSchedule/buildInput';
import type { GenerateScheduleInput } from '@/lib/schedule/generateSchedule/types';
import type { ScheduleEnginePerfCollector } from '@/lib/schedule/scheduleEnginePerf';

export async function loadGenerateScheduleInputForWeek(
  weekStart: string,
  boutiqueIds: string[],
  perf?: ScheduleEnginePerfCollector
): Promise<{
  input: GenerateScheduleInput;
  weekStart: string;
  guestShiftCount: number;
}> {
  const grid = perf
    ? await perf.timeAsync('loadGridMs', () => getScheduleGridForWeek(weekStart, { boutiqueIds }))
    : await getScheduleGridForWeek(weekStart, { boutiqueIds });

  const empIds = grid.rows.map((r) => r.empId);
  const ramadanRange = getRamadanRange();

  const [fairnessContext, guestShifts] = await Promise.all([
    perf
      ? perf.timeAsync('loadFairnessContextMs', () => loadFairnessContext(weekStart, empIds))
      : loadFairnessContext(weekStart, empIds),
    perf
      ? perf.timeAsync('loadGuestShiftsMs', () => loadWeekGuestShifts(weekStart, boutiqueIds))
      : loadWeekGuestShifts(weekStart, boutiqueIds),
  ]);

  const fairnessRows = buildEmployeeFairness(grid.rows, fairnessContext);
  const input = buildGenerateScheduleInput(grid, {
    guestShifts,
    fairnessRows,
    ramadanRange,
    perf,
  });

  return {
    input,
    weekStart: grid.weekStart,
    guestShiftCount: guestShifts.length,
  };
}
