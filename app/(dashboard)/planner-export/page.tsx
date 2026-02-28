import { redirect } from 'next/navigation';

/**
 * التصدير الموحد للمخطط أصبح في صفحة مزامنة المخطط.
 * إعادة توجيه لتجنب الازدواجية.
 */
export default function PlannerExportPage() {
  redirect('/sync/planner');
}
