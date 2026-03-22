export type CsvRow = Record<string, string | number>;

export function rowsToCsv(headers: string[], rows: CsvRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','));
  }
  return lines.join('\r\n');
}
