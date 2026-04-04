import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { NetworkExecutiveClient } from './NetworkExecutiveClient';

export default async function NetworkExecutivePage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        <NetworkExecutiveClient />
      </div>
    </div>
  );
}
