/**
 * Shared UI class constants — aligned with design tokens (Stripe/Linear-style).
 * Use these for consistent surfaces, buttons, inputs, and tables.
 */

/** Page background */
export const pageBg = 'bg-background';

/** Shared focus ring (matches globals.css :focus-visible) */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Card: surface, border, shadow, radius from design tokens (--radius-card) */
export const card = 'rounded-card border border-border bg-surface shadow-card overflow-hidden';

/**
 * Panel/card geometry (no shadow) — compose with shadow-sm or shadow-card to avoid utility clashes.
 */
export const surfacePanel = 'rounded-card border border-border bg-surface';

/** Compact card padding used by ui/Card */
export const cardPadding = 'p-4 md:p-5';

/** Text (token-aligned) */
export const textPrimary = 'text-foreground';
export const textSecondary = 'text-muted';
export const textMuted = 'text-muted';

/** Borders */
export const borderDefault = 'border-border';
export const borderStrong = 'border-border';

/** Buttons — accent primary, surface secondary */
export const btnPrimary =
  'h-9 md:h-10 rounded-md px-4 font-medium bg-accent hover:bg-accent-hover text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none';
export const btnSecondary =
  'h-9 md:h-10 rounded-md px-4 font-medium bg-surface border border-border text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';
export const btnDanger =
  'h-9 md:h-10 rounded-md px-4 font-medium bg-red-600 hover:bg-red-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';
export const btnGhost =
  'h-9 md:h-10 rounded-md px-4 font-medium bg-transparent text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';

/** Form inputs baseline */
export const inputBase =
  'h-9 md:h-10 rounded-md border border-border bg-surface px-3 text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 disabled:opacity-50';

/** Table */
export const tableWrapper = 'bg-surface border border-border rounded-card overflow-hidden shadow-sm';
export const tableHeaderRow = 'bg-surface-subtle border-b border-border';
export const tableHeaderCell = 'px-3 py-2.5 text-xs md:text-sm font-semibold text-foreground';
export const tableCell = 'px-3 py-2.5 text-sm';
export const tableCellMuted = 'text-muted';

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

/** Status pills (inventory + warnings + task StatusPill) */
export const pillBase = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border';
export const pillPending = 'bg-amber-50 text-amber-900 border-amber-200';
export const pillLate = 'bg-red-50 text-red-900 border-red-200';
export const pillCompleted = 'bg-emerald-50 text-emerald-900 border-emerald-200';
export const pillNeutral = 'bg-slate-50 text-slate-700 border-slate-200';
/** Task primary assignee / info chip */
export const pillInfo = 'bg-sky-50 text-sky-800 border-sky-200';
/** Subtle neutral aligned with surface tokens */
export const pillMuted = 'bg-surface-subtle text-foreground border-border';

/** Alerts */
export const alertWarning = 'bg-amber-100 text-amber-900 border-amber-200';
export const alertSuccess = 'bg-emerald-100 text-emerald-900 border-emerald-200';
export const alertDanger = 'bg-red-100 text-red-900 border-red-200';

/** Badge (rounded-md, same semantics as pills) */
export const badgeBase =
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium';
export const badgeNeutral = 'bg-surface-subtle text-foreground border-border/80';
export const badgeSuccess = 'bg-emerald-50 text-emerald-900 border-emerald-200';
export const badgeWarning = 'bg-amber-50 text-amber-900 border-amber-200';
export const badgeDanger = 'bg-red-50 text-red-900 border-red-200';

/** Container */
export const containerWidth = 'max-w-6xl mx-auto px-4 md:px-6';

/** Filter bar / toolbar container */
export const filterBar =
  'rounded-card border border-border bg-surface p-4 flex flex-wrap items-end gap-3 shadow-sm';
