import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { ExecutiveSinglePageClient } from './ExecutiveSinglePageClient';

export default async function ExecutivePage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto max-w-screen-2xl px-4 py-5 md:px-6 md:py-7">
        <ExecutiveSinglePageClient />
      </div>
    </div>
  );
}
