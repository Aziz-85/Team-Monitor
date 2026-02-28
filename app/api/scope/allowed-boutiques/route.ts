/**
 * GET /api/scope/allowed-boutiques
 * SUPER_ADMIN only. Returns boutiques the user can access via ?b= (UserBoutiqueMembership.canAccess).
 * Used by the context picker to list options. No persistence.
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((user.role as string) !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const memberships = await prisma.userBoutiqueMembership.findMany({
    where: { userId: user.id, canAccess: true },
    include: {
      boutique: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  const boutiques = memberships
    .filter((m) => m.boutique)
    .map((m) => ({
      code: m.boutique!.code,
      name: m.boutique!.name,
      id: m.boutique!.id,
    }));

  const defaultCode = user.boutique?.code ?? boutiques[0]?.code ?? '';

  return NextResponse.json({
    boutiques,
    defaultCode,
  });
}
