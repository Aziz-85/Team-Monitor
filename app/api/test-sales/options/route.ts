import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canUseSalesTestModule } from '@/lib/test-sales/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseSalesTestModule(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ boutiques });
}
