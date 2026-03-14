/**
 * GET /api/compliance — list compliance items for operational boutique(s).
 * POST /api/compliance — create item (MANAGER, ADMIN, SUPER_ADMIN).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getDaysRemaining, getComplianceStatus } from '@/lib/compliance/status';
import { COMPLIANCE_ROLES } from '@/lib/permissions';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await getSessionUser();
  const canWrite = user ? COMPLIANCE_ROLES.includes(user.role as Role) : false;

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const items = await prisma.complianceItem.findMany({
    where: { boutiqueId: { in: scope.boutiqueIds } },
    include: { boutique: { select: { id: true, name: true, code: true } } },
    orderBy: [{ expiryDateGregorian: 'asc' }, { name: 'asc' }],
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const enriched: Array<{
    id: string;
    name: string;
    category: string;
    boutiqueId: string;
    boutiqueName: string;
    boutiqueCode: string;
    expiryDate: string;
    notes: string | null;
    reminderDaysBefore: number;
    daysRemaining: number;
    status: string;
    attachmentFileName: string | null;
    createdAt: string;
    updatedAt: string;
  }> = items.map((item) => {
    const daysRemaining = getDaysRemaining(item.expiryDateGregorian, today);
    const status = getComplianceStatus(daysRemaining);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      boutiqueId: item.boutiqueId,
      boutiqueName: item.boutique.name,
      boutiqueCode: item.boutique.code,
      dateType: item.dateType,
      expiryDateGregorian: item.expiryDateGregorian.toISOString().slice(0, 10),
      expiryDateHijri: item.expiryDateHijri,
      expiryDate: item.expiryDateGregorian.toISOString().slice(0, 10),
      notes: item.notes,
      reminderDaysBefore: item.reminderDaysBefore,
      daysRemaining,
      status,
      attachmentFileName: item.attachmentFileName,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  });

  const boutiques = await prisma.boutique.findMany({
    where: { id: { in: scope.boutiqueIds }, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    items: enriched,
    scope: {
      boutiqueId: scope.boutiqueId,
      boutiqueIds: scope.boutiqueIds,
      boutiques: boutiques.map((b) => ({ id: b.id, name: b.name, code: b.code })),
      canWrite,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const body = await request.json();
  const { name, category, boutiqueId, dateType, expiryDateGregorian, expiryDateHijri, notes, reminderDaysBefore } = body;

  if (!name || !category || !boutiqueId) {
    return NextResponse.json(
      { error: 'name, category, boutiqueId required' },
      { status: 400 }
    );
  }

  let gregorianDate: Date;
  let storedHijri: string | null = null;
  const dt = String(dateType || 'GREGORIAN').toUpperCase();

  if (dt === 'HIJRI' && expiryDateHijri) {
    const { parseHijriToGregorianIso } = await import('@/lib/compliance/hijriConvert');
    const iso = parseHijriToGregorianIso(String(expiryDateHijri).trim());
    if (!iso) {
      return NextResponse.json({ error: 'Invalid Hijri date (use YYYY-MM-DD or DD/MM/YYYY)' }, { status: 400 });
    }
    gregorianDate = new Date(iso + 'T00:00:00Z');
    storedHijri = String(expiryDateHijri).trim();
  } else if (expiryDateGregorian) {
    gregorianDate = new Date(String(expiryDateGregorian).slice(0, 10) + 'T00:00:00Z');
  } else {
    return NextResponse.json(
      { error: 'expiryDateGregorian or (dateType=HIJRI and expiryDateHijri) required' },
      { status: 400 }
    );
  }

  if (!scope.boutiqueIds.includes(boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
  }

  const item = await prisma.complianceItem.create({
    data: {
      name: String(name).trim(),
      category: String(category).trim(),
      boutiqueId,
      dateType: dt === 'HIJRI' ? 'HIJRI' : 'GREGORIAN',
      expiryDateGregorian: gregorianDate,
      expiryDateHijri: storedHijri,
      notes: notes ? String(notes).trim() : null,
      reminderDaysBefore: reminderDaysBefore != null ? Math.max(0, Number(reminderDaysBefore)) : 30,
    },
    include: { boutique: { select: { id: true, name: true, code: true } } },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const daysRemaining = getDaysRemaining(item.expiryDateGregorian, today);
  const status = getComplianceStatus(daysRemaining);

  return NextResponse.json({
    id: item.id,
    name: item.name,
    category: item.category,
    boutiqueId: item.boutiqueId,
    boutiqueName: item.boutique.name,
    boutiqueCode: item.boutique.code,
    dateType: item.dateType,
    expiryDateGregorian: item.expiryDateGregorian.toISOString().slice(0, 10),
    expiryDateHijri: item.expiryDateHijri,
    expiryDate: item.expiryDateGregorian.toISOString().slice(0, 10),
    notes: item.notes,
    reminderDaysBefore: item.reminderDaysBefore,
    daysRemaining,
    status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}
