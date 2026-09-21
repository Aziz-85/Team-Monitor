const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidSalesDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function validateBoutiqueSalesRange(from: string, to: string): string | null {
  if (!isValidSalesDateKey(from) || !isValidSalesDateKey(to)) return 'Use valid dates in YYYY-MM-DD format.';
  if (from > to) return 'The start date must be on or before the end date.';
  return null;
}
