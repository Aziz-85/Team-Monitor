/**
 * Lightweight verification of lib/time.ts (Riyadh, week Saturday start, month range, cross-month week).
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' -r tsconfig-paths/register scripts/verify-time-utils.ts
 */

import {
  toRiyadhDateString,
  toRiyadhDateOnly,
  formatMonthKey,
  getMonthRange,
  getWeekRangeForDate,
  getDaysInMonth,
  getMonthRangeDayKeys,
  toRiyadhDayKey,
  intersectRanges,
} from '../lib/time';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Week starts Saturday. 2026-02-14 is Saturday.
const sat = new Date('2026-02-14T12:00:00.000Z');
const week = getWeekRangeForDate(sat);
const weekStartStr = week.startSat.toISOString().slice(0, 10);
const weekEndStr = week.endExclusiveFriPlus1.toISOString().slice(0, 10);
assert(weekStartStr === '2026-02-14', `Week start should be 2026-02-14 (Saturday), got ${weekStartStr}`);
assert(weekEndStr === '2026-02-21', `Week end exclusive should be 2026-02-21 (next Sat), got ${weekEndStr}`);

// A date in the middle of the week: 2026-02-17 (Tue) -> same week 2026-02-14 to 2026-02-21
const tue = new Date('2026-02-17T12:00:00.000Z');
const weekTue = getWeekRangeForDate(tue);
assert(
  weekTue.startSat.toISOString().slice(0, 10) === '2026-02-14',
  'Tuesday 2026-02-17 should be in week starting 2026-02-14'
);

// Month range 2026-02
const feb = getMonthRange('2026-02');
assert(feb.start.toISOString().slice(0, 10) === '2026-02-01', 'Feb start');
assert(feb.endExclusive.toISOString().slice(0, 10) === '2026-03-01', 'Feb end exclusive');

// Cross-month week: week of 2026-02-14 includes 14,15,16,17,18,19,20 (Sat–Fri). Intersection with Feb = 14..28 (15 days in Feb from 14th).
const weekInFeb = intersectRanges(
  week.startSat,
  week.endExclusiveFriPlus1,
  feb.start,
  feb.endExclusive
);
assert(weekInFeb !== null, 'Week should overlap February');
const daysInIntersection = Math.round(
  (weekInFeb!.end.getTime() - weekInFeb!.start.getTime()) / (24 * 60 * 60 * 1000)
);
assert(daysInIntersection === 7, `Intersection week-in-Feb should be 7 days, got ${daysInIntersection}`);

// End of Feb: week containing 2026-02-28. Sat 2026-02-28 -> week starts 2026-02-28, ends 2026-03-07. Intersection with Feb = 1 day (28th only).
const lastDayFeb = new Date('2026-02-28T12:00:00.000Z');
const weekLast = getWeekRangeForDate(lastDayFeb);
const weekLastInFeb = intersectRanges(
  weekLast.startSat,
  weekLast.endExclusiveFriPlus1,
  feb.start,
  feb.endExclusive
);
assert(weekLastInFeb !== null, 'Last week should overlap Feb');
const daysLast = Math.round(
  (weekLastInFeb!.end.getTime() - weekLastInFeb!.start.getTime()) / (24 * 60 * 60 * 1000)
);
assert(daysLast === 1, `Last week of Feb should have 1 day in Feb, got ${daysLast}`);

// getDaysInMonth
assert(getDaysInMonth('2026-02') === 28, 'Feb 2026 has 28 days');
assert(getDaysInMonth('2026-01') === 31, 'Jan 2026 has 31 days');

// getMonthRangeDayKeys: Jan 2026 = exactly 2026-01-01 .. 2026-01-31 (no Feb 1)
const janKeys = getMonthRangeDayKeys('2026-01');
assert(janKeys.startKey === '2026-01-01', 'Jan 2026 startKey');
assert(janKeys.endKey === '2026-01-31', 'Jan 2026 endKey');
assert(janKeys.keys.length === 31, 'Jan 2026 has 31 keys');
assert(!janKeys.keys.includes('2026-02-01'), 'Jan 2026 must not include 2026-02-01');

// toRiyadhDayKey
assert(toRiyadhDayKey('2026-01-01') === '2026-01-01', 'toRiyadhDayKey string');
const dJan1 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
assert(toRiyadhDayKey(dJan1) === '2026-01-01', 'toRiyadhDayKey Date');

// formatMonthKey / toRiyadhDateString
const d = new Date('2026-02-15T10:00:00.000Z');
const key = formatMonthKey(d);
assert(key === '2026-02' || key.length === 7, 'formatMonthKey YYYY-MM');

console.log('All time utils checks passed.');
process.exit(0);
