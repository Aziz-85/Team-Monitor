/**
 * Parse official KPI Excel using fixed cell map. Deterministic, no ML.
 * Validates scores 0..5. Returns structured snapshot or throws with readable error.
 */

import type { KpiCellMap } from './cellMap';

export type KpiSectionItem = { metric: string; weight?: number; rating?: number; score: number };
export type KpiSection = {
  name: string;
  weightPct?: number;
  totalScore: number;
  items: KpiSectionItem[];
};
export type KpiParseResult = {
  overallOutOf5: number;
  salesKpiOutOf5: number;
  skillsOutOf5: number;
  companyOutOf5: number;
  sections: KpiSection[];
  raw: Record<string, unknown>;
};

const MIN_SCORE = 0;
const MAX_SCORE = 5;

function getCellValue(sheet: { [key: string]: { v?: unknown } }, ref: string): unknown {
  const cell = sheet[ref];
  if (!cell) return undefined;
  return cell.v;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateScore(value: unknown, cellRef: string): number {
  const n = toNumber(value);
  if (n === null) throw new Error(`Cell ${cellRef}: missing or non-numeric value`);
  if (n < MIN_SCORE || n > MAX_SCORE) {
    throw new Error(`Cell ${cellRef}: score must be between ${MIN_SCORE} and ${MAX_SCORE}, got ${n}`);
  }
  return Math.round(n * 100) / 100;
}

import * as XLSX from 'xlsx';

export function parseKpiExcel(
  buffer: Buffer,
  cellMapJson: string
): KpiParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel has no worksheet');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Worksheet not found');

  let cellMap: KpiCellMap;
  try {
    cellMap = JSON.parse(cellMapJson) as KpiCellMap;
  } catch {
    throw new Error('Invalid cellMapJson');
  }

  const raw: Record<string, unknown> = {};

  const overallOutOf5 = validateScore(
    getCellValue(sheet, cellMap.overallOutOf5),
    cellMap.overallOutOf5
  );
  raw.overallOutOf5 = overallOutOf5;

  const salesKpiOutOf5 = validateScore(
    getCellValue(sheet, cellMap.salesKpiOutOf5),
    cellMap.salesKpiOutOf5
  );
  raw.salesKpiOutOf5 = salesKpiOutOf5;

  const skillsOutOf5 = validateScore(
    getCellValue(sheet, cellMap.skillsOutOf5),
    cellMap.skillsOutOf5
  );
  raw.skillsOutOf5 = skillsOutOf5;

  const companyOutOf5 = validateScore(
    getCellValue(sheet, cellMap.companyOutOf5),
    cellMap.companyOutOf5
  );
  raw.companyOutOf5 = companyOutOf5;

  const sections: KpiSection[] = [];
  if (cellMap.sectionCells?.length) {
    for (const sec of cellMap.sectionCells) {
      const totalScore = validateScore(
        getCellValue(sheet, sec.totalCell),
        sec.totalCell
      );
      const items: KpiSectionItem[] = (sec.items || []).map((item) => {
        const score = validateScore(getCellValue(sheet, item.cell), item.cell);
        return { metric: item.metric, score };
      });
      sections.push({ name: sec.name, totalScore, items });
    }
  } else {
    sections.push(
      { name: 'Sales KPI', totalScore: salesKpiOutOf5, items: [] },
      { name: 'Skills', totalScore: skillsOutOf5, items: [] },
      { name: 'Company Values', totalScore: companyOutOf5, items: [] }
    );
  }

  return {
    overallOutOf5,
    salesKpiOutOf5,
    skillsOutOf5,
    companyOutOf5,
    sections,
    raw,
  };
}
