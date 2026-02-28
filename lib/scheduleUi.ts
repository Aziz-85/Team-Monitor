/**
 * Single source of truth for Schedule table UI.
 * Schedule (View) is the golden baseline — compact, dense, readable.
 * Schedule (Editor) matches View sizes; only minimal control-specific adjustments.
 */

/** Compact baseline: h-9 row/header, px-2 py-1, text-sm/leading-5 */
export const SCHEDULE_UI = {
  table: 'w-full border-collapse table-fixed',
  tableSeparate: 'w-full table-fixed border-separate border-spacing-0',
  headerRow: 'h-9 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border-b border-slate-200',
  headerCell: 'h-9 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border-b border-slate-200',
  cell: 'h-9 px-2 py-1 text-sm leading-5 border-b border-slate-200 align-middle',
  cellBase: 'h-9 px-2 py-1 text-sm leading-5 border-b border-slate-200 align-middle',
  dateCell: 'h-9 px-2 py-1 text-xs text-slate-700 border-b border-slate-200 bg-white align-middle',
  dayCell: 'h-9 px-2 py-1 text-xs font-medium text-slate-700 border-b border-slate-200 bg-white align-middle',
  amCell: 'h-9 px-2 py-1 text-sm leading-5 border-b border-slate-200 bg-sky-50/50 text-blue-900 align-middle overflow-hidden',
  pmCell: 'h-9 px-2 py-1 text-sm leading-5 border-b border-slate-200 bg-amber-50/50 text-amber-900 align-middle overflow-hidden',
  coverageCell: 'h-9 px-2 py-1 text-xs leading-5 border-b border-slate-200 bg-slate-50 text-slate-700 align-middle overflow-hidden',
  countCell: 'h-9 px-2 py-1 text-xs font-semibold text-center align-middle border-b border-slate-200',
  amCountCell: 'h-9 px-1 py-1 text-xs font-semibold text-center align-middle bg-blue-100 border-b border-slate-200',
  pmCountCell: 'h-9 px-1 py-1 text-xs font-semibold text-center align-middle bg-amber-100 border-b border-slate-200',
  /** For forms outside schedule table cells */
  select: 'h-9 w-full min-w-0 text-sm px-2 rounded-md border border-slate-300 bg-white cursor-pointer',
  placeholder: 'h-9 rounded-md border border-dashed border-slate-200 bg-transparent',
  /** Use ONLY inside schedule table cells — fits compact rows */
  selectCompact: 'h-8 w-full min-w-0 text-sm px-2 rounded-md border border-slate-300 bg-white cursor-pointer',
  placeholderCompact: 'h-8 w-full rounded-md border border-dashed border-slate-200 bg-transparent',
  guestLine: 'text-xs leading-5 whitespace-nowrap overflow-hidden text-ellipsis',
  guestStack: 'flex flex-col gap-0',
  stickyLeft: 'sticky left-0 z-10 bg-white border-r border-slate-200',
  stickyHeader: 'sticky left-0 z-10 bg-slate-50 border-r border-slate-200',
  borderDefault: 'border border-slate-200',
  borderL2: 'border-l-2 border-slate-400',
};

/** Dense column widths: View proportions, same in Editor */
export const SCHEDULE_COLS = {
  date: 'w-[60px]',
  day: 'w-[52px]',
  teamA: 'min-w-[240px]',
  teamB: 'min-w-[240px]',
  coverage: 'min-w-[220px]',
  am: 'min-w-[240px]',
  pm: 'min-w-[240px]',
  counts: 'w-[34px]',
  countAm: 'w-[34px]',
  countPm: 'w-[34px]',
  dateExcel: 'w-[60px]',
  dayExcel: 'w-[52px]',
};

export const MAX_COVERAGE_LINES = 3;
