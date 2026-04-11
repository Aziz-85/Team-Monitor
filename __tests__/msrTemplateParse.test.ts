import {
  MSR_V2_CANONICAL_EMPLOYEES,
  detectMsrDataSheetLayout,
  headerMatchesMsrV2Canonical,
  isIgnoredMsrMetricColumn,
  parseMsrTemplateV2FromAoa,
  resolveMsrV2ColumnMap,
  resolveTemplateHeaderToUniqueUser,
  type MsrTemplateMatchCandidate,
} from '@/lib/sales/msrTemplateParse';

const V2_HEADER = [
  'Date',
  'Abdulhadi',
  'Hussain',
  'Muslim',
  'AlAnoud',
  'Abdulaziz',
  'Total Sale After',
  'AVT',
] as const;

describe('msrTemplateParse', () => {
  test('isIgnoredMsrMetricColumn ignores metrics and totals', () => {
    expect(isIgnoredMsrMetricColumn('AVT')).toBe(true);
    expect(isIgnoredMsrMetricColumn('upt')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Total Sale After')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Total')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Hussain')).toBe(false);
  });

  test('MSR V2: resolveMsrV2ColumnMap requires all five employees', () => {
    const map = resolveMsrV2ColumnMap([...V2_HEADER]);
    expect(map).not.toBeNull();
    expect(MSR_V2_CANONICAL_EMPLOYEES.length).toBe(5);
    for (const name of MSR_V2_CANONICAL_EMPLOYEES) {
      expect(map!.employeeColByCanonical.has(name)).toBe(true);
    }
  });

  test('detectMsrDataSheetLayout: template only when V2 header complete', () => {
    const rows: unknown[][] = [[...V2_HEADER], ['2026-01-02', 0, 4900, 0, 0, 0, 4900, 1]];
    const layout = detectMsrDataSheetLayout(rows);
    expect(layout?.kind).toBe('template_columns');
    expect(layout?.headerIndex).toBe(0);
  });

  test('detectMsrDataSheetLayout: legacy when Total Sale After and empIds after', () => {
    const rows: unknown[][] = [
      ['Date', 'Total Sale After', 'E001', 'E002'],
      ['2026-01-02', 1000, 600, 400],
    ];
    const layout = detectMsrDataSheetLayout(rows);
    expect(layout?.kind).toBe('legacy_msr');
  });

  test('parseMsrTemplateV2FromAoa filters rows and validates total', () => {
    const header = [...V2_HEADER];
    const map = resolveMsrV2ColumnMap(header)!;
    const aoa: unknown[][] = [
      header,
      ['2026-01-02', 0, 4900, 0, 0, 0, 4900, 1],
      ['', '', '', '', '', '', '', ''],
      ['Total', '', '', '', '', '', '', ''],
      ['2026-01-03', 100, 200, 0, 0, 0, 999, 0],
    ];
    const parsed = parseMsrTemplateV2FromAoa(aoa, { headerRowIndex: 0, columnMap: map });
    expect(parsed.stats.validRowsProcessed).toBe(2);
    expect(parsed.stats.skippedEmptyRows).toBe(1);
    expect(parsed.stats.skippedSummaryRows).toBe(1);
    expect(parsed.totalMismatchWarnings.length).toBe(1);
    expect(parsed.totalMismatchWarnings[0]!.delta).toBe(300 - 999);
    const hussainRow = parsed.rows.find((r) => r.employeeHeader === 'Hussain');
    expect(hussainRow?.sales).toBe(4900);
  });

  test('headerMatchesMsrV2Canonical handles Al Anoud', () => {
    expect(headerMatchesMsrV2Canonical('Al Anoud', 'AlAnoud')).toBe(true);
  });

  test('resolveTemplateHeaderToUniqueUser matches name or empId', () => {
    const candidates: MsrTemplateMatchCandidate[] = [
      { userId: 'u1', empId: 'E1', boutiqueId: 'b1', name: 'Hussain Ali' },
      { userId: 'u2', empId: 'E2', boutiqueId: 'b1', name: 'Other Person' },
    ];
    const ids = new Set(candidates.map((c) => c.empId));
    expect(resolveTemplateHeaderToUniqueUser('Hussain', candidates, ids)?.userId).toBe('u1');
    expect(resolveTemplateHeaderToUniqueUser('E1', candidates, ids)?.userId).toBe('u1');
    expect(resolveTemplateHeaderToUniqueUser('Nobody', candidates, ids)).toBeNull();
  });
});
