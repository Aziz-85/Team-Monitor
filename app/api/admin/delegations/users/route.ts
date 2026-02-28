/**
 * GET /api/admin/delegations/users?boutiqueId=...
 * Returns users for the given boutique (for target user selector). ADMIN: any boutique; MANAGER: only their boutique.
 * SUPER_ADMIN is excluded from the list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { userListWhere } from '@/lib/userListWhere';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = user.role as Role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? user.boutiqueId ?? '';
  if (!boutiqueId) return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });

  if (role === 'MANAGER' && boutiqueId !== user.boutiqueId) {
    return NextResponse.json({ error: 'Forbidden: only your boutique' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      boutiqueId,
      disabled: false,
      ...userListWhere({ includeSuperAdmin: false }),
    },
    select: {
      id: true,
      empId: true,
      role: true,
      employee: { select: { name: true } },
    },
    orderBy: [{ empId: 'asc' }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      empId: u.empId,
      role: u.role,
      name: u.employee?.name ?? u.empId,
    })),
  });
}
