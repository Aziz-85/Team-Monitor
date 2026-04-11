import {
  detectMsrDataSheetLayout,
  isIgnoredMsrMetricColumn,
  parseMsrTemplateDataSheetFromAoa,
  resolveTemplateHeaderToUniqueUser,
  type MsrTemplateMatchCandidate,
} from '@/lib/sales/msrTemplateParse';

describe('msrTemplateParse', () => {
  test('isIgnoredMsrMetricColumn ignores metrics and totals', () => {
    expect(isIgnoredMsrMetricColumn('AVT')).toBe(true);
    expect(isIgnoredMsrMetricColumn('upt')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Total Sale After')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Total')).toBe(true);
    expect(isIgnoredMsrMetricColumn('Hussain')).toBe(false);
  });

  test('detectMsrDataSheetLayout: template when names between Date and Total Sale After', () => {
    const rows: unknown[][] = [
      ['Date', 'Hussain', 'Abdulaziz', 'Total Sale After', 'AVT'],
      ['2026-01-02', 4900, 0, 4900, 1],
    ];
    const layout = detectMsrDataSheetLayout(rows);
    expect(layout?.kind).toBe('template_columns');
    expect(layout?.headerIndex).toBe(0);
  });

  test('detectMsrDataSheetLayout: legacy when only Total Sale After and empIds after', () => {
    const rows: unknown[][] = [
      ['Date', 'Total Sale After', 'E001', 'E002'],
      ['2026-01-02', 1000, 600, 400],
    ];
    const layout = detectMsrDataSheetLayout(rows);
    expect(layout?.kind).toBe('legacy_msr');
  });

  test('parseMsrTemplateDataSheetFromAoa transforms columns to rows', () => {
    const aoa: unknown[][] = [
      ['Date', 'Hussain', 'Abdulaziz', 'AVT', 'Total'],
      ['2026-01-02', 4900, '', ' ', 4900],
    ];
    const parsed = parseMsrTemplateDataSheetFromAoa(aoa, { headerRowIndex: 0 });
    expect(parsed.rowsGenerated).toBe(1);
    expect(parsed.rows[0]).toMatchObject({
      dateKey: '2026-01-02',
      employeeHeader: 'Hussain',
      sales: 4900,
    });
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
