import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { collectArchitectureData } from '@/lib/architecture/collectArchitecture';
import { ArchitectureConsoleClient } from './ArchitectureConsoleClient';

export const dynamic = 'force-dynamic';

function ForbiddenArchitecturePage() {
  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          The Architecture Console is restricted to SUPER_ADMIN accounts.
        </p>
      </div>
    </main>
  );
}

export default async function ArchitecturePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'SUPER_ADMIN') return <ForbiddenArchitecturePage />;

  const data = await collectArchitectureData({
    name: user.employee?.name,
    username: user.empId,
    role: user.role,
  });

  return <ArchitectureConsoleClient data={data} />;
}
