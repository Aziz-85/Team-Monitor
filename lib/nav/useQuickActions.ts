'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getRiyadhDateKey } from '@/lib/dates/riyadhDate';
import { actionKeyFromPathname, QUICK_ACTION_DEFS, QUICK_ACTION_FALLBACK, type QuickActionKey } from '@/lib/nav/quickActions';

type UsageStateV1 = {
  v: 1;
  counts: Record<string, number>;
  lastUsedAt: Record<string, number>;
  lastUsedDateKey: Record<string, string>;
};

const STORAGE_KEY = 'dt_quick_actions_v1';

function safeParse(json: string | null): UsageStateV1 | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as UsageStateV1;
    if (!obj || obj.v !== 1 || typeof obj.counts !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

function loadState(): UsageStateV1 {
  if (typeof window === 'undefined') return { v: 1, counts: {}, lastUsedAt: {}, lastUsedDateKey: {} };
  const existing = safeParse(window.localStorage.getItem(STORAGE_KEY));
  return existing ?? { v: 1, counts: {}, lastUsedAt: {}, lastUsedDateKey: {} };
}

function saveState(state: UsageStateV1) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function useQuickActions(maxItems: number = 5) {
  const pathname = usePathname();
  const [state, setState] = useState<UsageStateV1>(() => loadState());

  const track = useCallback((key: QuickActionKey) => {
    const now = Date.now();
    const todayKey = getRiyadhDateKey();
    setState((prev) => {
      const next: UsageStateV1 = {
        v: 1,
        counts: { ...prev.counts },
        lastUsedAt: { ...prev.lastUsedAt },
        lastUsedDateKey: { ...prev.lastUsedDateKey },
      };
      next.counts[key] = (next.counts[key] ?? 0) + 1;
      next.lastUsedAt[key] = now;
      next.lastUsedDateKey[key] = todayKey;
      saveState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const k = actionKeyFromPathname(pathname);
    if (k) track(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const ranked = useMemo(() => {
    const todayKey = getRiyadhDateKey();
    const score = (k: QuickActionKey) => {
      const c = state.counts[k] ?? 0;
      const lastAt = state.lastUsedAt[k] ?? 0;
      const usedToday = state.lastUsedDateKey[k] === todayKey;
      const freshness = lastAt > 0 ? Math.min(1, (Date.now() - lastAt) / (1000 * 60 * 60 * 24 * 14)) : 1;
      const recencyBoost = lastAt > 0 ? (1 - freshness) * 0.25 : 0;
      const notUsedTodayBoost = usedToday ? 0 : 0.05;
      return c + recencyBoost + notUsedTodayBoost;
    };

    const defs = QUICK_ACTION_DEFS;
    const allKeys = defs.map((d) => d.key);
    const hasAny = allKeys.some((k) => (state.counts[k] ?? 0) > 0);
    if (!hasAny) {
      return QUICK_ACTION_FALLBACK.map((k) => defs.find((d) => d.key === k)!).filter(Boolean).slice(0, maxItems);
    }

    return [...defs]
      .sort((a, b) => score(b.key) - score(a.key))
      .slice(0, maxItems);
  }, [state, maxItems]);

  return { actions: ranked, track };
}

