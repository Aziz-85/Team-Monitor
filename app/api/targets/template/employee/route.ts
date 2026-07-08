/**
 * GET /api/targets/template/employee?month=YYYY-MM — alias for employees route.
 */

import { NextRequest } from 'next/server';
import { downloadEmployeeTargetsTemplate } from '@/lib/targets/templateDownload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return downloadEmployeeTargetsTemplate(request);
}
