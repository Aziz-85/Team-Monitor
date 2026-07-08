/**
 * GET /api/targets/template/boutique?month=YYYY-MM — alias for boutiques route.
 */

import { NextRequest } from 'next/server';
import { downloadBoutiqueTargetsTemplate } from '@/lib/targets/templateDownload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return downloadBoutiqueTargetsTemplate(request);
}
