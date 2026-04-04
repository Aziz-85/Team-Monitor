import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { ExecutiveEmployeesClient } from './ExecutiveEmployeesClient';

export default async function ExecutiveEmployeesPage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return (
    <div className="min-h-screen bg-surface-subtle">
      <ExecutiveEmployeesClient />
    </div>
  );
}
