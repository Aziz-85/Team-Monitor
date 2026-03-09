/**
 * Target Management — Excel template generation (server-side).
 * Sheet names and column order must match import parser exactly.
 */

import * as XLSX from 'xlsx';

const BOUTIQUE_SHEET = 'BOUTIQUE_TARGETS';
const EMPLOYEE_SHEET = 'EMPLOYEE_TARGETS';
const README_SHEET = 'README';

const BOUTIQUE_HEADERS = ['Month', 'ScopeId', 'BoutiqueName', 'Target', 'Source', 'Notes'];
const EMPLOYEE_HEADERS = ['Month', 'ScopeId', 'BoutiqueName', 'EmployeeCode', 'EmployeeName', 'Target', 'Source', 'Notes'];

/** Boutique template: BOUTIQUE_TARGETS + README */
export function buildBoutiqueTargetsTemplate(): Buffer {
  const dataRows: unknown[][] = [
    BOUTIQUE_HEADERS,
    ['2025-01', 'S05', 'Dhahran Mall', 500000, 'OFFICIAL', ''],
    ['2025-01', 'S02', 'AlRashid', 300000, 'OFFICIAL', ''],
  ];
  const readmeRows: unknown[][] = [
    ['BOUTIQUE TARGETS — Import rules'],
    [],
    ['Required format:'],
    ['- Sheet name must be: BOUTIQUE_TARGETS'],
    ['- Columns in order: Month, ScopeId, BoutiqueName, Target, Source, Notes'],
    ['- Month: YYYY-MM only (e.g. 2025-01)'],
    ['- ScopeId: allowed values include S05 (Dhahran), S02 (AlRashid)'],
    ['- BoutiqueName: should match the boutique for ScopeId (warning if mismatch)'],
    ['- Target: integer only, no decimals; non-negative'],
    ['- Source: default OFFICIAL'],
    ['- Notes: optional'],
    [],
    ['Rules:'],
    ['- One row per boutique per month'],
    ['- Duplicate (boutique + month) in file will be flagged'],
    ['- Do not reorder columns or rename sheet'],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, BOUTIQUE_SHEET);
  XLSX.utils.book_append_sheet(wb, wsReadme, README_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Employee template: EMPLOYEE_TARGETS + README */
export function buildEmployeeTargetsTemplate(): Buffer {
  const dataRows: unknown[][] = [
    EMPLOYEE_HEADERS,
    ['2025-01', 'S05', 'Dhahran Mall', 'EMP001', 'Example Employee', 100000, 'OFFICIAL', ''],
  ];
  const readmeRows: unknown[][] = [
    ['EMPLOYEE TARGETS — Import rules'],
    [],
    ['Required format:'],
    ['- Sheet name must be: EMPLOYEE_TARGETS'],
    ['- Columns: Month, ScopeId, BoutiqueName, EmployeeCode, EmployeeName, Target, Source, Notes'],
    ['- Month: YYYY-MM'],
    ['- ScopeId: required (e.g. S05, S02)'],
    ['- EmployeeCode: required if available; used for exact match'],
    ['- EmployeeName: required'],
    ['- Target: integer only; non-negative'],
    ['- Source: default OFFICIAL'],
    ['- Notes: optional'],
    [],
    ['Rules:'],
    ['- Historical / resigned employees: targets are valid for past months'],
    ['- If employee transferred, target must match the correct boutique for that month'],
    ['- Do not reorder columns or rename sheet names'],
    ['- Ambiguous employee match (e.g. duplicate name without code) will fail the row'],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, EMPLOYEE_SHEET);
  XLSX.utils.book_append_sheet(wb, wsReadme, README_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export { BOUTIQUE_SHEET, EMPLOYEE_SHEET, BOUTIQUE_HEADERS, EMPLOYEE_HEADERS };
