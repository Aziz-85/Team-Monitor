import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { ExecutiveEmployeeDetailClient } from './ExecutiveEmployeeDetailClient';

export default async function ExecutiveEmployeeDetailPage({
  params,
}: {
  params: Promise<{ empId: string }>;
}) {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  const { empId } = await params;
  return (
    <div className="min-h-screen bg-background p-4 pb-nav md:p-6">
      <ExecutiveEmployeeDetailClient empId={empId} />
    </div>
  );
}
