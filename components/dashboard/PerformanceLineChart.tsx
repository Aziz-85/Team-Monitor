'use client';

import {
  TargetVsActualLineChart,
  type TargetVsActualReportingChrome,
} from '@/components/charts/TargetVsActualLineChart';

type Point = { label: string; value: number };
type Props = {
  data: Point[];
  targetLine?: number[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
  reportingChrome?: TargetVsActualReportingChrome;
};

/** Home theme target-vs-actual line chart. Wraps shared TargetVsActualLineChart. */
export function PerformanceLineChart({
  data,
  targetLine,
  height = 240,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No sales data yet',
  reportingChrome,
}: Props) {
  return (
    <TargetVsActualLineChart
      data={data}
      targetLine={targetLine}
      height={height}
      valueFormat={valueFormat}
      emptyLabel={emptyLabel}
      theme="home"
      reportingChrome={reportingChrome}
    />
  );
}
