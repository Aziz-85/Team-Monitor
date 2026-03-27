/**
 * GET /api/analytics/forecast?month=YYYY-MM&global=true
 * Read-only linear + optional 7-day rolling forecast. Subset wrapper for clients that only need projection fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET as performanceGet } from '@/app/api/analytics/performance/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const res = await performanceGet(request);
  if (!res.ok) return res;
  const full = (await res.json()) as {
    boutique?: {
      monthlyTarget: number;
      actualMTD: number;
      remaining: number;
      pace: unknown;
      forecast: {
        forecastedTotal: number;
        forecastDelta: number;
        forecastRatio: number | null;
        avgDailyActual: number;
      };
      forecastRolling7: {
        forecastedTotal: number;
        forecastDelta: number;
        forecastRatio: number | null;
        avgDailyActual: number;
      } | null;
    };
    employees?: unknown[];
    monthKey?: string;
    daysPassed?: number;
    daysInMonth?: number;
  };
  const b = full.boutique;
  if (!b) {
    return NextResponse.json({ error: 'No data' }, { status: 403 });
  }
  return NextResponse.json({
    monthKey: full.monthKey,
    daysPassed: full.daysPassed,
    daysInMonth: full.daysInMonth,
    disclaimer: 'projection_only',
    linear: b.forecast,
    rolling7: b.forecastRolling7,
    actualMTD: b.actualMTD,
    monthlyTarget: b.monthlyTarget,
  });
}
