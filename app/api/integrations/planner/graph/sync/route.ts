import { NextResponse } from 'next/server';
import { requirePlannerIntegrationAccess } from '@/lib/integrations/planner/permissions';
import { handleAdminError } from '@/lib/admin/requireAdmin';
import { isGraphConfigured } from '@/lib/integrations/planner/graphClient';

export async function POST() {
  try {
    await requirePlannerIntegrationAccess();
  } catch (e) {
    return handleAdminError(e);
  }

  if (!isGraphConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: 'Microsoft Graph credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.',
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    message: 'Graph sync not yet implemented. Use Power Automate webhook or manual file import.',
  });
}
