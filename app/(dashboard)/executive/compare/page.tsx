import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { ExecutiveCompareClient } from './ExecutiveCompareClient';

export default async function ExecutiveComparePage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <ExecutiveCompareClient />
    </div>
  );
}
