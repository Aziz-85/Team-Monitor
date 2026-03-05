/**
 * Diagnose matrix import: parse the template file and print first rows.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/diagnose-matrix-import.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseMatrixWorkbook } from '../lib/sales/importMatrix';

const FILE = path.join(__dirname, '../TeamMonitor_Monthly_Import_Template_Matrix copy.xlsx');

function main() {
  if (!fs.existsSync(FILE)) {
    console.error('File not found:', FILE);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const result = parseMatrixWorkbook(buf);
  if (!result.ok) {
    console.error('Parse error:', result.error);
    process.exit(1);
  }

  console.log('\n=== PARSER OUTPUT ===');
  console.log('rowsRead:', result.rowsRead);
  console.log('cellsParsed:', result.cellsParsed);
  console.log('monthRange:', result.monthRange);
  console.log('scopeIds:', result.scopeIds);

  // Group cells by dateKey and sum
  const byDate = new Map<string, { total: number; empAmounts: { empId: string; amount: number }[] }>();
  for (const c of result.cells) {
    let entry = byDate.get(c.dateKey);
    if (!entry) {
      entry = { total: 0, empAmounts: [] };
      byDate.set(c.dateKey, entry);
    }
    entry.total += c.amount;
    entry.empAmounts.push({ empId: c.empId, amount: c.amount });
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  console.log('\n=== TOTALS BY DATE (first 5 days) ===');
  for (const [dateKey, { total, empAmounts }] of sorted.slice(0, 5)) {
    console.log(`${dateKey}: total=${total.toLocaleString()}`, empAmounts.map((e) => `${e.empId}:${e.amount}`).join(', '));
  }

  const day1 = byDate.get('2026-01-01');
  const day2 = byDate.get('2026-01-02');
  console.log('\n=== EXPECTED vs ACTUAL ===');
  console.log('2026-01-01 expected: 47,300 | actual:', day1?.total ?? 'MISSING');
  console.log('2026-01-02 expected: 177,450 | actual:', day2?.total ?? 'MISSING');
  if (day1?.total === 47300) {
    console.log('\n✓ Day 01 OK');
  } else {
    console.log('\n✗ Day 01 WRONG - fix needed');
  }
}

main();
