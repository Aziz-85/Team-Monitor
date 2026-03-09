import { NextRequest, NextResponse } from 'next/server';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { runReconciliation } from '@/lib/integrations/planner/reconcile';

export async function POST(request: NextRequest) {
  try {
    await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  const integrationId = request.nextUrl.searchParams.get('integrationId') ?? null;
  const result = await runReconciliation(integrationId);
  return NextResponse.json(result);
}
