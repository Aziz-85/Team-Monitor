/**
 * Prints week range, month range, intersection days, and computed week target
 * for a given monthKey and date. Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/verify-sales-targets.ts [monthKey] [date]
 * Example: npx ts-node -r tsconfig-paths/register scripts/verify-sales-targets.ts 2026-02 2026-02-28
 */

import {
  getMonthRange,
  getWeekRangeForDate,
  getDaysInMonth,
  intersectRanges,
  toRiyadhDateString,
} from '../lib/time';

const monthKey = process.argv[2] || '2026-02';
const dateStr = process.argv[3] || '2026-02-28';
const date = new Date(dateStr + 'T12:00:00.000Z');

const { start: monthStart, endExclusive: monthEnd } = getMonthRange(monthKey);
const { startSat, endExclusiveFriPlus1 } = getWeekRangeForDate(date);
const weekInMonth = intersectRanges(startSat, endExclusiveFriPlus1, monthStart, monthEnd);
const daysInMonth = getDaysInMonth(monthKey);

console.log('Month key:', monthKey);
console.log('Date:', dateStr, '(Riyadh:', toRiyadhDateString(date) + ')');
console.log('Month range:');
console.log('  start:', monthStart.toISOString().slice(0, 10));
console.log('  endExclusive:', monthEnd.toISOString().slice(0, 10));
console.log('Week range (Sat–Fri):');
console.log('  startSat:', startSat.toISOString().slice(0, 10));
console.log('  endExclusive (next Sat):', endExclusiveFriPlus1.toISOString().slice(0, 10));
console.log('Intersection (week ∩ month):');
if (weekInMonth) {
  const daysCount = Math.round(
    (weekInMonth.end.getTime() - weekInMonth.start.getTime()) / (24 * 60 * 60 * 1000)
  );
  console.log('  start:', weekInMonth.start.toISOString().slice(0, 10));
  console.log('  end:', weekInMonth.end.toISOString().slice(0, 10));
  console.log('  days in intersection:', daysCount);
  const exampleMonthlyTarget = 30000;
  const dailyTarget = exampleMonthlyTarget / daysInMonth;
  const weekTarget = daysCount * dailyTarget;
  console.log('Example (monthly target 30,000 SAR):');
  console.log('  dailyTarget:', dailyTarget.toFixed(2));
  console.log('  weekTarget for this week-in-month:', weekTarget.toFixed(2));
} else {
  console.log('  (no overlap)');
}
console.log('Days in month:', daysInMonth);
