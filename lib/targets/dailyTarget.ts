/**
 * Daily target computation — single source of truth for web and mobile.
 * Used by /api/me/targets (employee) and manager dashboard (boutique-level).
 * Formula: distribute monthTarget across calendar days; first `remainder` days get base+1, rest get base.
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
