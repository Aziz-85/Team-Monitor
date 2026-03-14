/**
 * PATCH /api/compliance/:id — update compliance item.
 * DELETE /api/compliance/:id — delete compliance item.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getDaysRemaining, getComplianceStatus } from '@/lib/compliance/status';
import { COMPLIANCE_ROLES } from '@/lib/permissions';
import { unlink } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const ATTACH_BASE = 'data/compliance-attachments';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const existing = await prisma.complianceItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.boutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.category !== undefined) update.category = String(body.category).trim();
  if (body.boutiqueId !== undefined) {
    if (!scope.boutiqueIds.includes(body.boutiqueId)) {
      return NextResponse.json({ error: 'Forbidden: boutique not in scope' }, { status: 403 });
    }
    update.boutiqueId = body.boutiqueId;
  }
  if (body.dateType !== undefined || body.expiryDateGregorian !== undefined || body.expiryDateHijri !== undefined) {
    const dt = String(body.dateType ?? existing.dateType).toUpperCase();
    if (dt === 'HIJRI' && body.expiryDateHijri) {
      const { parseHijriToGregorianIso } = await import('@/lib/compliance/hijriConvert');
      const iso = parseHijriToGregorianIso(String(body.expiryDateHijri).trim());
      if (!iso) {
        return NextResponse.json({ error: 'Invalid Hijri date (use YYYY-MM-DD or DD/MM/YYYY)' }, { status: 400 });
      }
      update.expiryDateGregorian = new Date(iso + 'T00:00:00Z');
      update.expiryDateHijri = String(body.expiryDateHijri).trim();
      update.dateType = 'HIJRI';
    } else if (body.expiryDateGregorian) {
      update.expiryDateGregorian = new Date(String(body.expiryDateGregorian).slice(0, 10) + 'T00:00:00Z');
      update.expiryDateHijri = null;
      update.dateType = 'GREGORIAN';
    }
  }
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null;
  if (body.reminderDaysBefore !== undefined) {
    update.reminderDaysBefore = Math.max(0, Number(body.reminderDaysBefore));
  }

  const item = await prisma.complianceItem.update({
    where: { id },
    data: update,
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(COMPLIANCE_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const scope = await getOperationalScope(_request);
  if (!scope?.boutiqueIds?.length) {
    return NextResponse.json({ error: 'No operational boutique' }, { status: 403 });
  }

  const existing = await prisma.complianceItem.findUnique({
    where: { id },
    select: { boutiqueId: true, attachmentStoragePath: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.boutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (existing.attachmentStoragePath) {
    const fullPath = path.join(process.cwd(), ATTACH_BASE, existing.attachmentStoragePath);
    if (existsSync(fullPath)) {
      try {
        await unlink(fullPath);
      } catch {
        // ignore
      }
    }
  }

  await prisma.complianceItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
