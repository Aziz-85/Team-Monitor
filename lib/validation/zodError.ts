import { NextResponse } from 'next/server';
import type { ZodError, ZodType } from 'zod';

/** Map Zod issues to a single user-facing message (no stack traces). */
export function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request';
  const path = first.path.length > 0 ? first.path.join('.') : 'request';
  if (first.message) return `${path}: ${first.message}`;
  return `Invalid ${path}`;
}

export function validationErrorResponse(error: ZodError, status = 400): NextResponse {
  return NextResponse.json({ error: formatZodError(error) }, { status });
}

export type ParseSuccess<T> = { ok: true; data: T };
export type ParseFailure = { ok: false; response: NextResponse };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export function parseValue<T>(raw: unknown, schema: ZodType<T>): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, response: validationErrorResponse(result.error) };
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  return parseValue(raw, schema);
}

export function parseJsonString<T>(json: string, schema: ZodType<T>): ParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid applyPlan JSON' }, { status: 400 }) };
  }
  return parseValue(raw, schema);
}

/** Parse apply-plan JSON from FormData; returns 400 NextResponse on failure. */
export function parseApplyPlanFromFormData<T>(
  applyPlanRaw: FormDataEntryValue | null | undefined,
  schema: ZodType<T>
): ParseResult<T> {
  if (!applyPlanRaw || typeof applyPlanRaw !== 'string') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing applyPlan from dry run preview' },
        { status: 400 }
      ),
    };
  }
  return parseJsonString(applyPlanRaw, schema);
}

export function optionalFormSha256(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formForceReprocess(value: FormDataEntryValue | null | undefined): boolean {
  return value === 'true';
}
