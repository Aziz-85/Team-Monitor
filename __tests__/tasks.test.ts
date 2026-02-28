/**
 * Minimal tests: task schedule logic (weekly days, monthly day, last day).
 * Logic inlined to avoid loading Prisma in test run.
 */

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getLastDayOfMonth(date: Date): number {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (month === 1) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month] ?? 31;
}

type TaskSchedule = {
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  weeklyDays: number[];
  monthlyDay: number | null;
  isLastDay: boolean;
};

function tasksRunnableOnDate(
  taskSchedules: TaskSchedule[],
  date: Date
): boolean {
  const dayOfWeek = date.getUTCDay();
  const dayOfMonth = date.getUTCDate();
  const lastDay = getLastDayOfMonth(date);

  for (const sched of taskSchedules) {
    if (sched.type === 'DAILY') return true;
    if (sched.type === 'WEEKLY' && sched.weeklyDays?.includes(dayOfWeek)) return true;
    if (sched.type === 'MONTHLY') {
      if (sched.isLastDay && dayOfMonth === lastDay) return true;
      if (sched.monthlyDay != null && sched.monthlyDay === dayOfMonth) return true;
    }
  }
  return false;
}

describe('tasksRunnableOnDate', () => {
  it('DAILY runs every day', () => {
    const scheds: TaskSchedule[] = [{ type: 'DAILY', weeklyDays: [], monthlyDay: null, isLastDay: false }];
    const d = new Date('2025-02-07T12:00:00Z');
    expect(tasksRunnableOnDate(scheds, d)).toBe(true);
  });

  it('WEEKLY runs only on selected days', () => {
    const scheds: TaskSchedule[] = [
      { type: 'WEEKLY', weeklyDays: [1, 3], monthlyDay: null, isLastDay: false },
    ];
    const mon = new Date('2025-02-03T12:00:00Z');
    const wed = new Date('2025-02-05T12:00:00Z');
    const tue = new Date('2025-02-04T12:00:00Z');
    expect(tasksRunnableOnDate(scheds, mon)).toBe(true);
    expect(tasksRunnableOnDate(scheds, wed)).toBe(true);
    expect(tasksRunnableOnDate(scheds, tue)).toBe(false);
  });

  it('MONTHLY runs on monthlyDay', () => {
    const scheds: TaskSchedule[] = [
      { type: 'MONTHLY', weeklyDays: [], monthlyDay: 15, isLastDay: false },
    ];
    const d15 = new Date('2025-02-15T12:00:00Z');
    const d14 = new Date('2025-02-14T12:00:00Z');
    expect(tasksRunnableOnDate(scheds, d15)).toBe(true);
    expect(tasksRunnableOnDate(scheds, d14)).toBe(false);
  });

  it('MONTHLY isLastDay runs on last day of month', () => {
    const scheds: TaskSchedule[] = [
      { type: 'MONTHLY', weeklyDays: [], monthlyDay: null, isLastDay: true },
    ];
    const lastJan = new Date('2025-01-31T12:00:00Z');
    const lastFeb = new Date('2025-02-28T12:00:00Z');
    const notLast = new Date('2025-01-30T12:00:00Z');
    expect(tasksRunnableOnDate(scheds, lastJan)).toBe(true);
    expect(tasksRunnableOnDate(scheds, lastFeb)).toBe(true);
    expect(tasksRunnableOnDate(scheds, notLast)).toBe(false);
  });
});
