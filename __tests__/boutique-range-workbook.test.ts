import ExcelJS from 'exceljs';
import { buildBoutiqueRangeWorkbook } from '@/lib/sales/boutiqueRangeWorkbook';

describe('boutique sales range Excel export', () => {
  it('writes the selected period, typed dates, daily rows and matching totals', async () => {
    const buffer = await buildBoutiqueRangeWorkbook({
      boutiqueId: 'boutique-1',
      boutiqueLabel: 'Dhahran',
      from: '2025-09-01',
      to: '2025-09-30',
      days: [
        { date: '2025-09-01', salesSar: 72050, invoices: 2, pieces: 3 },
        { date: '2025-09-02', salesSar: 13050, invoices: 2, pieces: 2 },
      ],
      totals: { salesSar: 85100, invoices: 4, pieces: 5 },
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Boutique Sales');
    expect(sheet).toBeDefined();
    expect(sheet!.getCell('B3').value).toBe('Dhahran');
    expect(sheet!.getCell('B4').value).toBeInstanceOf(Date);
    expect(sheet!.getCell('A9').value).toBeInstanceOf(Date);
    expect(sheet!.getCell('B9').value).toBe(72050);
    expect(sheet!.getCell('B10').value).toBe(13050);
    expect(sheet!.getCell('A11').value).toBe('Total');
    expect(sheet!.getCell('B11').value).toBe(85100);
    expect(sheet!.getCell('C11').value).toBe(4);
    expect(sheet!.getCell('D11').value).toBe(5);
  });
});
