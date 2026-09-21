import ExcelJS from 'exceljs';
import type { BoutiqueRangeReport } from './boutiqueRangeReport';

export async function buildBoutiqueRangeWorkbook(report: BoutiqueRangeReport): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Monitor';
  const sheet = workbook.addWorksheet('Boutique Sales', {
    views: [{ state: 'frozen', ySplit: 8 }],
    properties: { defaultRowHeight: 20 },
  });
  sheet.columns = [
    { key: 'date', width: 18 },
    { key: 'sales', width: 22 },
    { key: 'invoices', width: 18 },
    { key: 'pieces', width: 18 },
  ];
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'Boutique Sales by Date Range';
  sheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF18324B' } };
  sheet.getCell('A3').value = 'Boutique';
  sheet.getCell('B3').value = report.boutiqueLabel;
  sheet.getCell('A4').value = 'From';
  sheet.getCell('B4').value = new Date(`${report.from}T00:00:00.000Z`);
  sheet.getCell('A5').value = 'To';
  sheet.getCell('B5').value = new Date(`${report.to}T00:00:00.000Z`);
  sheet.getCell('B4').numFmt = 'yyyy-mm-dd';
  sheet.getCell('B5').numFmt = 'yyyy-mm-dd';
  sheet.getCell('A6').value = 'Values are net sales after discount (SAR). Invoice and piece counts include only records where entered.';
  sheet.mergeCells('A6:D6');
  sheet.getCell('A6').font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };

  const header = sheet.getRow(8);
  header.values = ['Date', 'Net sales (SAR)', 'Invoices recorded', 'Pieces recorded'];
  header.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18324B' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 25;

  for (const day of report.days) {
    const row = sheet.addRow([
      new Date(`${day.date}T00:00:00.000Z`),
      day.salesSar,
      day.invoices,
      day.pieces,
    ]);
    row.getCell(1).numFmt = 'yyyy-mm-dd';
    for (let col = 2; col <= 4; col++) row.getCell(col).numFmt = '#,##0';
    if (row.number % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7FA' } };
  }

  const total = sheet.addRow(['Total', report.totals.salesSar, report.totals.invoices, report.totals.pieces]);
  total.font = { name: 'Arial', bold: true, color: { argb: 'FF18324B' } };
  total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EDF5' } };
  for (let col = 2; col <= 4; col++) total.getCell(col).numFmt = '#,##0';
  sheet.autoFilter = { from: 'A8', to: `D${Math.max(8, total.number - 1)}` };

  return workbook.xlsx.writeBuffer();
}
