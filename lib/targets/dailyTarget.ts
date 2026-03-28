/**
 * Reporting (calendar allocation) — NOT operational required pace.
 * Distributes integer monthTarget across calendar days for reports / MTD trajectory:
 *   base = floor(monthTarget / daysInMonth), first `remainder` days get base+1.
 *
 * Operational “daily required to stay on track” uses
 * `lib/targets/requiredPaceTargets` (remaining month ÷ remaining days).
 */
export function getDailyTargetForDay(
  monthTarget: number,
  daysInMonth: number,
  dayOfMonth1Based: number
): number {
  if (daysInMonth <= 0) return 0;
  const base = Math.floor(monthTarget / daysInMonth);
  const remainder = monthTarget - base * daysInMonth;
  return base + (dayOfMonth1Based <= remainder ? 1 : 0);
}
