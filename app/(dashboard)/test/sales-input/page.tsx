import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canUseSalesTestModule } from '@/lib/test-sales/access';
import { SalesTestInputClient } from '@/components/test-sales/SalesTestInputClient';

export const dynamic = 'force-dynamic';

function InputLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted">
      Loading…
    </div>
  );
}

export default async function SalesTestInputPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canUseSalesTestModule(user.role)) redirect('/dashboard');

  return (
    <Suspense fallback={<InputLoading />}>
      <SalesTestInputClient />
    </Suspense>
  );
}
