/**
 * Shared UI class constants for consistent theme across the app.
 * Theme: light professional, high readability, Excel-like tables, mobile-friendly.
 */

/** Page background */
export const pageBg = 'bg-slate-50';

/** Card: white, border, shadow, rounded */
export const card = 'bg-white border border-slate-200 shadow-sm rounded-xl';

/** Text */
export const textPrimary = 'text-slate-900';
export const textSecondary = 'text-slate-600';
export const textMuted = 'text-slate-500';

/** Borders */
export const borderDefault = 'border-slate-200';
export const borderStrong = 'border-slate-300';

/** Buttons */
export const btnPrimary =
  'h-9 md:h-10 rounded-lg px-4 font-medium bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
export const btnSecondary =
  'h-9 md:h-10 rounded-lg px-4 font-medium bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
export const btnDanger =
  'h-9 md:h-10 rounded-lg px-4 font-medium bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2';

/** Form inputs baseline */
export const inputBase =
  'h-9 md:h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

/** Table */
export const tableWrapper = 'bg-white border border-slate-200 rounded-xl overflow-hidden';
export const tableHeaderRow = 'bg-slate-50 border-b border-slate-200';
export const tableHeaderCell = 'px-3 py-2 text-xs md:text-sm font-semibold text-slate-700';
export const tableCell = 'px-3 py-2 text-sm';
export const tableCellMuted = 'text-slate-500';

/** Schedule Excel blocks */
export const excelMorningHeader = 'bg-sky-50 text-sky-800 border-slate-200';
export const excelMorningBody = 'bg-sky-50/40 text-sky-800';
export const excelEveningHeader = 'bg-amber-50 text-amber-900 border-slate-200';
export const excelEveningBody = 'bg-amber-50/40 text-amber-900';
export const excelBlockDivider = 'border-r border-slate-300';
export const excelEmptyCell = 'text-slate-500';
export const excelCountHeader = 'bg-slate-50 font-semibold text-slate-700';
export const excelCountNormal = 'text-slate-700';
export const excelCountWarning = 'bg-amber-100 text-amber-900 font-semibold';
export const excelCountError = 'bg-red-100 text-red-900 font-semibold';

/** Status pills (inventory + warnings) */
export const pillBase = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border';
export const pillPending = 'bg-amber-50 text-amber-900 border-amber-200';
export const pillLate = 'bg-red-50 text-red-900 border-red-200';
export const pillCompleted = 'bg-emerald-50 text-emerald-900 border-emerald-200';
export const pillNeutral = 'bg-slate-50 text-slate-700 border-slate-200';

/** Alerts */
export const alertWarning = 'bg-amber-100 text-amber-900 border-amber-200';
export const alertSuccess = 'bg-emerald-100 text-emerald-900 border-emerald-200';
export const alertDanger = 'bg-red-100 text-red-900 border-red-200';

/** Container */
export const containerWidth = 'max-w-6xl mx-auto px-4 md:px-6';
