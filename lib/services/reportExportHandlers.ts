/**
 * Shared Excel download response for Reports Export Center APIs.
 */

import { NextResponse } from 'next/server';

export function excelDownloadResponse(
  buffer: ArrayBuffer,
  filename: string
): NextResponse {
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function parseQueryBool(
  source: URLSearchParams | Record<string, unknown>,
  key: string,
  defaultValue: boolean
): boolean {
  const raw =
    source instanceof URLSearchParams
      ? source.get(key)
      : typeof source[key] === 'string'
        ? (source[key] as string)
        : source[key] != null
          ? String(source[key])
          : null;
  if (raw == null || raw === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

export function getQueryString(
  source: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key)?.trim() ?? undefined;
  const v = source[key];
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : undefined;
}
