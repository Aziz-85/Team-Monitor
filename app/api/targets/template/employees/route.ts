/**
 * GET /api/targets/template/employees — Download employee targets Excel template.
 */

import { NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import { buildEmployeeTargetsTemplate } from '@/lib/targets/templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scopeResult = await requireTargetsImport(null);
  if (scopeResult.res) return scopeResult.res;

  const buffer = buildEmployeeTargetsTemplate();
  const filename = 'EmployeeTargetsTemplate.xlsx';
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
