/**
 * Read boutique metadata from README sheet in yearly sales import templates.
 */

import * as XLSX from 'xlsx';

const README_SHEET = 'README';

export type YearlyImportReadmeMeta = {
  boutiqueId: string | null;
  boutiqueCode: string | null;
  boutiqueName: string | null;
  year: string | null;
};

function trimCell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

/** Parse key/value rows from README (first column = key, second = value). */
export function parseYearlyImportReadme(buffer: Buffer): YearlyImportReadmeMeta {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { boutiqueId: null, boutiqueCode: null, boutiqueName: null, year: null };
  }

  const sheet = workbook.Sheets[README_SHEET];
  if (!sheet) {
    return { boutiqueId: null, boutiqueCode: null, boutiqueName: null, year: null };
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const meta: YearlyImportReadmeMeta = {
    boutiqueId: null,
    boutiqueCode: null,
    boutiqueName: null,
    year: null,
  };

  for (const row of rows) {
    const key = trimCell(row[0]).toLowerCase();
    const value = trimCell(row[1]);
    if (!key || !value) continue;
    if (key === 'boutiqueid') meta.boutiqueId = value;
    else if (key === 'boutiquecode') meta.boutiqueCode = value;
    else if (key === 'boutiquename') meta.boutiqueName = value;
    else if (key === 'year') meta.year = value;
  }

  return meta;
}
