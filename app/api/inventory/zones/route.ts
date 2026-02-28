import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { listZones, createZone, updateZone, deleteZone } from '@/lib/services/inventoryZones';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const zones = await listZones(boutiqueId);
  return NextResponse.json(zones);
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const body = await request.json().catch(() => ({}));
  const code = body.code as string | undefined;
  if (!code?.trim()) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }
  try {
    const zone = await createZone(boutiqueId, code, body.name);
    return NextResponse.json(zone);
  } catch {
    return NextResponse.json({ error: 'Zone code may already exist' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  try {
    const zone = await updateZone(id, {
      code: body.code,
      name: body.name,
      active: body.active,
    });
    return NextResponse.json(zone);
  } catch {
    return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  try {
    await deleteZone(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
  }
}
