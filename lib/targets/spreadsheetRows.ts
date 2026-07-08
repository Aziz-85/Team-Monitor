import * as XLSX from 'xlsx';

export type SheetRowsResult =
  | { ok: true; rows: Record<string, unknown>[]; rowIndexes: number[] }
  | { ok: false; error: string };

function normalizeHeader(label: string): string {
  return label.trim().toLowerCase();
}

function isBlankRow(line: unknown[]): boolean {
  return line.every((cell) => cell == null || String(cell).trim() === '');
}

/** Read data rows from a sheet using header names from the first row. */
export function readRowsByHeaders(
  sheet: XLSX.WorkSheet,
  requiredHeaders: readonly string[]
): SheetRowsResult {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (matrix.length === 0) {
    return { ok: false, error: 'Sheet is empty' };
  }

  const headerRow = (matrix[0] as unknown[]).map((cell) => String(cell ?? '').trim());
  const headerIndex = new Map<string, number>();
  headerRow.forEach((label, idx) => {
    if (!label) return;
    headerIndex.set(normalizeHeader(label), idx);
  });

  const missing = requiredHeaders.filter((header) => !headerIndex.has(normalizeHeader(header)));
  if (missing.length > 0) {
    return { ok: false, error: `Missing columns: ${missing.join(', ')}` };
  }

  const rows: Record<string, unknown>[] = [];
  const rowIndexes: number[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] as unknown[];
    if (!line || isBlankRow(line)) continue;

    const row: Record<string, unknown> = {};
    for (const header of requiredHeaders) {
      const idx = headerIndex.get(normalizeHeader(header))!;
      row[header] = line[idx] ?? '';
    }
    rows.push(row);
    rowIndexes.push(r + 1);
  }

  return { ok: true, rows, rowIndexes };
}
