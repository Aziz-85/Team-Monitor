'use client';

import { TargetVsActualLineChart } from '@/components/charts/TargetVsActualLineChart';

type Point = { label: string; value: number };
type Props = {
  data: Point[];
  targetLine?: number[];
  height?: number;
  valueFormat?: (n: number) => string;
  emptyLabel?: string;
};

/** Home theme target-vs-actual line chart. Wraps shared TargetVsActualLineChart. */
export function PerformanceLineChart({
  data,
  targetLine,
  height = 240,
  valueFormat = (n) => n.toLocaleString(),
  emptyLabel = 'No sales data yet',
}: Props) {
  return (
    <TargetVsActualLineChart
      data={data}
      targetLine={targetLine}
      height={height}
      valueFormat={valueFormat}
      emptyLabel={emptyLabel}
      theme="home"
    />
  );
}
