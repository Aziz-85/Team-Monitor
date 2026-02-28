'use client';

import {
  ScheduleMonthExcelViewClient,
  type MonthExcelDayRow,
} from '@/app/(dashboard)/schedule/excel/ScheduleMonthExcelViewClient';

export type ScheduleEditMonthExcelViewProps = {
  month: string;
  dayRows: MonthExcelDayRow[];
  formatDDMM: (d: string) => string;
  t: (k: string) => string;
};

export function ScheduleEditMonthExcelViewClient(props: ScheduleEditMonthExcelViewProps) {
  return <ScheduleMonthExcelViewClient {...props} />;
}

