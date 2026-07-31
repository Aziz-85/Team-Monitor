import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { DailyPerformanceClient } from './DailyPerformanceClient';

export default async function DailyPerformancePage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');
  return <DailyPerformanceClient />;
}
