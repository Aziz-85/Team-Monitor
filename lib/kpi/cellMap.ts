/**
 * Cell map for official KPI template. Fixed addresses (deterministic parsing).
 * Calibrate via admin "Template Calibration" or update here after confirming sample file.
 */

export type KpiCellMap = {
  overallOutOf5: string;
  salesKpiOutOf5: string;
  skillsOutOf5: string;
  companyOutOf5: string;
  /** Optional: section totals / line items for sectionsJson */
  sectionCells?: Array<{ name: string; totalCell: string; items?: Array<{ metric: string; cell: string }> }>;
};

export const OFFICIAL_TEMPLATE_CODE = 'KPI_SALES_EVAL_V1';
export const OFFICIAL_TEMPLATE_NAME = 'Sales Department Employee Evaluation';

/** Default cell map (placeholder). Update after calibration with real template. */
export const DEFAULT_CELL_MAP: KpiCellMap = {
  overallOutOf5: 'B2',
  salesKpiOutOf5: 'B3',
  skillsOutOf5: 'B4',
  companyOutOf5: 'B5',
  sectionCells: [
    { name: 'Sales KPI', totalCell: 'B3', items: [] },
    { name: 'Skills', totalCell: 'B4', items: [] },
    { name: 'Company Values', totalCell: 'B5', items: [] },
  ],
};

export function getDefaultCellMapJson(): string {
  return JSON.stringify(DEFAULT_CELL_MAP);
}
