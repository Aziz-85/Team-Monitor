/**
 * Rule-based management insights from production sales analytics metrics.
 */

export type SalesAnalyticsInsightInput = {
  mtdAchPct: number;
  mtdTargetSar: number;
  mtdSalesSar: number;
  remainingSar: number;
  forecastEomSar: number;
  todayVsYesterdayDeltaPct: number | null;
  todayVsWeekAgoDeltaPct: number | null;
  mtdVsPrevMonthDeltaPct: number | null;
  paceBand: 'ahead' | 'onTrack' | 'behind';
  branchTopSharePct: number | null;
  employeeTopSharePct: number | null;
  requiredDailyPaceSar: number;
};

export function buildSalesAnalyticsInsights(input: SalesAnalyticsInsightInput): string[] {
  const lines: string[] = [];

  if (input.remainingSar > 0 && input.mtdAchPct < 90) {
    lines.push('Sales are behind the monthly target pace; focus on closing the remaining gap.');
  }

  if (input.todayVsYesterdayDeltaPct != null && input.todayVsYesterdayDeltaPct >= 3) {
    lines.push('Today is materially stronger than yesterday at the same scope.');
  }
  if (input.todayVsYesterdayDeltaPct != null && input.todayVsYesterdayDeltaPct <= -5) {
    lines.push('Today is weak versus yesterday — review traffic, staffing, and conversion.');
  }

  if (input.todayVsWeekAgoDeltaPct != null && input.todayVsWeekAgoDeltaPct <= -5) {
    lines.push('Today underperforms the same weekday a week ago.');
  }

  if (input.mtdVsPrevMonthDeltaPct != null && input.mtdVsPrevMonthDeltaPct >= 5) {
    lines.push('MTD sales are improving compared with the same phase last month.');
  }
  if (input.mtdVsPrevMonthDeltaPct != null && input.mtdVsPrevMonthDeltaPct <= -5) {
    lines.push('MTD sales trail the same period last month.');
  }

  if (input.paceBand === 'behind') {
    lines.push('Actual MTD is behind linear monthly pace versus the reporting target.');
  } else if (input.paceBand === 'ahead') {
    lines.push('Actual MTD is ahead of linear pace versus the reporting target.');
  }

  if (
    input.mtdTargetSar > 0 &&
    input.forecastEomSar < input.mtdTargetSar &&
    input.forecastEomSar > 0
  ) {
    lines.push('Linear run-rate suggests end-of-month risk versus the monthly target.');
  }

  if (input.branchTopSharePct != null && input.branchTopSharePct >= 55 && input.branchTopSharePct < 100) {
    lines.push('One branch is carrying a large share of scope sales — check balance across locations.');
  }

  if (input.employeeTopSharePct != null && input.employeeTopSharePct >= 45) {
    lines.push('Sales contribution is concentrated among top performers — monitor team depth.');
  }

  if (input.requiredDailyPaceSar > 0 && lines.length === 0) {
    lines.push(
      'Required daily pace reflects remaining gap divided by days left in the month (including the selected date).'
    );
  }

  if (lines.length === 0) {
    lines.push('No strong risk signals from the current metrics; continue monitoring pace versus target.');
  }

  return lines.slice(0, 8);
}
