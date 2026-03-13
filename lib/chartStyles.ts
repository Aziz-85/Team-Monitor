/**
 * Shared chart design tokens for consistent styling across the project.
 * Use for all line charts, bar charts, sparklines, and chart containers.
 */

/** Actual / primary performance line — visually dominant */
export const CHART_ACTUAL_COLOR = '#0F766E';
export const CHART_ACTUAL_STROKE_WIDTH = 2.5;

/** Target / reference line — secondary, thinner or dashed */
export const CHART_TARGET_COLOR = '#94A3B8';
export const CHART_TARGET_STROKE_WIDTH = 1.5;
export const CHART_TARGET_DASH_ARRAY = '5 4';

/** Executive theme — gold accent */
export const CHART_EXECUTIVE_ACTUAL_COLOR = '#B8860B';
export const CHART_EXECUTIVE_TARGET_COLOR = '#D4C4A8';

/** Executive UI — cards, borders, accents (used by ExecutiveDashboardClient, etc.) */
export const EXECUTIVE_CARD_BORDER = '#E8DFC8';
export const EXECUTIVE_CARD_BG = '#FFFFFF';
export const EXECUTIVE_GOLD = '#C6A756';
export const EXECUTIVE_HOVER_BG = '#F8F4E8';

/** Grid lines — subtle */
export const CHART_GRID_COLOR = '#f1f5f9';
export const CHART_GRID_STROKE_WIDTH = 1;

/** Axis labels */
export const CHART_AXIS_COLOR = '#64748b';
export const CHART_AXIS_FONT_SIZE = 11;
export const CHART_AXIS_FONT_SIZE_SM = 10;

/** Tooltip */
export const CHART_TOOLTIP_BG = 'var(--surface)';
export const CHART_TOOLTIP_BORDER = 'var(--border)';
export const CHART_TOOLTIP_SHADOW = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';

/** Sparkline — minimal */
export const CHART_SPARKLINE_STROKE_WIDTH = 1.5;
export const CHART_SPARKLINE_OPACITY = 0.7;
