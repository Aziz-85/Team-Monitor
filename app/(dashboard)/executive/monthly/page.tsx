import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { MonthlyBoardClient } from './MonthlyBoardClient';

export default async function ExecutiveMonthlyPage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return (
    <div className="min-h-screen bg-[#F8F4E8]">
      <MonthlyBoardClient />
    </div>
  );
}
