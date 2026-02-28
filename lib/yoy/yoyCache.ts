/**
 * In-memory cache for YoY month data. TTL 10 minutes.
 * Key: ${branchCode}:${year}-${month}
 */

import type { YoYDay } from './yoySource';
import { loadYoYMonth } from './yoySource';
import type { YoYMonthInput } from './yoySource';

const TTL_MS = 10 * 60 * 1000;

type Entry = {
  data: Map<string, YoYDay>;
  ts: number;
};

const cache = new Map<string, Entry>();

function cacheKey(input: YoYMonthInput): string {
  const { branchCode, year, month } = input;
  const safe = branchCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
  return `${safe}:${year}-${String(month).padStart(2, '0')}`;
}

function isExpired(entry: Entry): boolean {
  return Date.now() - entry.ts > TTL_MS;
}

/**
 * Get YoY month data: from cache if valid, else load from Excel and cache.
 * Returns null if file missing.
 */
export async function getYoYMonthCached(
  input: YoYMonthInput
): Promise<Map<string, YoYDay> | null> {
  const key = cacheKey(input);
  const existing = cache.get(key);
  if (existing && !isExpired(existing)) return existing.data;

  const data = await loadYoYMonth(input);
  if (data) cache.set(key, { data, ts: Date.now() });
  return data;
}
