/**
 * GET /api/compliance/alerts
 * Returns items that are expired or expiring within 30 days.
 * Used by Home page Compliance Alerts card.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getDaysRemaining, getComplianceStatus } from '@/lib/compliance/status';
import { COMPLIANCE_ROLES } from '@/lib/permissions';

export async function GET(request: NextRequest) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ alerts: [] });
  }

  const items = await prisma.complianceItem.findMany({
    where: { boutiqueId: { in: scope.boutiqueIds } },
    include: { boutique: { select: { id: true, name: true, code: true } } },
    orderBy: [{ expiryDateGregorian: 'asc' }, { name: 'asc' }],
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const enriched = items.map((item) => {
    const daysRemaining = getDaysRemaining(item.expiryDateGregorian, today);
    const status = getComplianceStatus(daysRemaining);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      boutiqueId: item.boutiqueId,
      boutiqueName: item.boutique.name,
      boutiqueCode: item.boutique.code,
      expiryDate: item.expiryDateGregorian.toISOString().slice(0, 10),
      daysRemaining,
      status,
    };
  });

  const alerts = enriched.filter((a) => a.status === 'expired' || a.status === 'urgent');

  const nextExpiry =
    alerts.length === 0
      ? enriched
          .filter((a) => a.daysRemaining > 0)
          .sort((a, b) => a.daysRemaining - b.daysRemaining)[0] ?? null
      : null;

  return NextResponse.json({
    alerts,
    nextExpiry: nextExpiry
      ? { name: nextExpiry.name, daysRemaining: nextExpiry.daysRemaining }
      : null,
  });
}
