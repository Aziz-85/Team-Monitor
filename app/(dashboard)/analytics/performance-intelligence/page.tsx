import { redirect } from 'next/navigation';
import { gateExecutivePage } from '@/lib/executive/execAccess';
import { PerformanceIntelligenceClient } from './PerformanceIntelligenceClient';

export default async function PerformanceIntelligencePage() {
  const gate = await gateExecutivePage();
  if (!gate.ok) redirect(gate.redirect === 'login' ? '/login' : '/dashboard');

  return <PerformanceIntelligenceClient />;
}
