/**
 * Canonical ISO date/month parsing. Use for all API and range logic.
 * Accept ONLY "YYYY-MM-DD" and "YYYY-MM". No locale-based parsing (avoids Arabic DD/MM/YYYY flip).
 */

import { toRiyadhDateString } from '@/lib/time';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_REGEX = /^(\d{4})-(\d{2})$/;

export class InvalidIsoDateError extends Error {
  constructor(public readonly input: string) {
    super(`Invalid ISO date (expected YYYY-MM-DD): ${input}`);
    this.name = 'InvalidIsoDateError';
  }
}

export class InvalidMonthKeyError extends Error {
  constructor(public readonly input: string) {
    super(`Invalid month key (expected YYYY-MM, month 01-12): ${input}`);
    this.name = 'InvalidMonthKeyError';
  }
}

/**
 * Parse strict "YYYY-MM-DD" string. Returns Date at 00:00 UTC for that calendar day (Riyadh day boundary).
 * Throws InvalidIsoDateError if format is wrong or date is invalid. Do not use for locale input.
 */
export function parseIsoDateOrThrow(input: string): Date {
  if (input == null || typeof input !== 'string') {
    throw new InvalidIsoDateError(String(input));
  }
  const trimmed = input.trim();
  const match = trimmed.match(ISO_DATE_REGEX);
  if (!match) throw new InvalidIsoDateError(trimmed);
  const [, yStr, mStr, dStr] = match;
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new InvalidIsoDateError(trimmed);
  }
  if (month < 1 || month > 12) throw new InvalidIsoDateError(trimmed);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) throw new InvalidIsoDateError(trimmed);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Parse and validate "YYYY-MM" month key. Returns normalized "YYYY-MM" (month 01-12).
 * Throws InvalidMonthKeyError if invalid.
 */
export function parseMonthKeyOrThrow(input: string): string {
  if (input == null || typeof input !== 'string') {
    throw new InvalidMonthKeyError(String(input));
  }
  const trimmed = input.trim();
  const match = trimmed.match(ISO_MONTH_REGEX);
  if (!match) throw new InvalidMonthKeyError(trimmed);
  const [, yStr, mStr] = match;
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) throw new InvalidMonthKeyError(trimmed);
  if (month < 1 || month > 12) throw new InvalidMonthKeyError(trimmed);
  const m = String(month).padStart(2, '0');
  const y = String(year);
  if (y.length !== 4) throw new InvalidMonthKeyError(trimmed);
  return `${y}-${m}`;
}

/**
 * Format a Date as "YYYY-MM-DD" in Asia/Riyadh (for API responses and display).
 */
export function formatIsoDate(date: Date): string {
  return toRiyadhDateString(date);
}
