import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { StoreReportPayload } from '@/lib/reports/storeReportService';

const GREEN = rgb(0.06, 0.3, 0.23);
const GOLD = rgb(0.78, 0.65, 0.34);
const PAGE_SIZE: [number, number] = [842, 595];

function fmtSar(n: number): string {
  return `${Math.trunc(n).toLocaleString('en-US')} SAR`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n}%`;
}

type PdfContext = {
  pdfDoc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  page: PDFPage;
  y: number;
  margin: number;
};

function addPage(ctx: PdfContext): void {
  ctx.page = ctx.pdfDoc.addPage(PAGE_SIZE);
  ctx.y = PAGE_SIZE[1] - ctx.margin;
}

function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y - needed < ctx.margin + 24) addPage(ctx);
}

function drawReportHeader(ctx: PdfContext, meta: StoreReportPayload['meta']): void {
  const { width, height } = ctx.page.getSize();
  ctx.page.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: GREEN });
  ctx.page.drawText('Store Performance Report', {
    x: ctx.margin,
    y: height - 26,
    size: 16,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.page.drawText(
    `${meta.boutiqueName} (${meta.boutiqueCode}) · ${meta.monthKey} · Generated ${meta.generatedAt}`,
    {
      x: ctx.margin,
      y: height - 36,
      size: 9,
      font: ctx.font,
      color: rgb(0.85, 0.95, 0.9),
    }
  );
  ctx.y = height - 56;
}

function sectionTitle(ctx: PdfContext, title: string): void {
  ensureSpace(ctx, 24);
  ctx.page.drawText(title, {
    x: ctx.margin,
    y: ctx.y,
    size: 11,
    font: ctx.fontBold,
    color: GOLD,
  });
  ctx.y -= 18;
}

function line(ctx: PdfContext, label: string, value: string): void {
  ensureSpace(ctx, 16);
  ctx.page.drawText(label, {
    x: ctx.margin,
    y: ctx.y,
    size: 9,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });
  ctx.page.drawText(value, {
    x: ctx.margin + 260,
    y: ctx.y,
    size: 9,
    font: ctx.fontBold,
    color: rgb(0, 0, 0),
  });
  ctx.y -= 14;
}

function drawTeamTable(ctx: PdfContext, rows: StoreReportPayload['storeDetail']['teamPerformance']): void {
  const colX = [ctx.margin, ctx.margin + 180, ctx.margin + 280, ctx.margin + 380, ctx.margin + 460];
  const headers = ['Employee', 'Target', 'Actual', 'Ach %', 'Disc %'];

  ensureSpace(ctx, 20 + rows.length * 14);
  headers.forEach((h, i) => {
    ctx.page.drawText(h, { x: colX[i], y: ctx.y, size: 8, font: ctx.fontBold, color: rgb(0.2, 0.2, 0.2) });
  });
  ctx.y -= 14;

  for (const row of rows) {
    ensureSpace(ctx, 14);
    const values = [
      row.employeeName.slice(0, 28),
      fmtSar(row.target),
      fmtSar(row.actual),
      `${row.achievementPct}%`,
      row.discountPct != null ? `${row.discountPct}%` : '—',
    ];
    values.forEach((v, i) => {
      ctx.page.drawText(v, {
        x: colX[i],
        y: ctx.y,
        size: 8,
        font: row.isTotal ? ctx.fontBold : ctx.font,
        color: rgb(0.15, 0.15, 0.15),
      });
    });
    ctx.y -= 13;
  }
  ctx.y -= 8;
}

function drawMonthlyTable(
  ctx: PdfContext,
  title: string,
  points: StoreReportPayload['ytdPerformance']['charts']['boutiqueMonthly']
): void {
  sectionTitle(ctx, title);
  const colX = [ctx.margin, ctx.margin + 80, ctx.margin + 200, ctx.margin + 320, ctx.margin + 440];
  const headers = ['Month', 'Current Yr', 'Last Yr', 'Target', 'Ach %'];

  ensureSpace(ctx, 20 + points.length * 13);
  headers.forEach((h, i) => {
    ctx.page.drawText(h, { x: colX[i], y: ctx.y, size: 8, font: ctx.fontBold, color: rgb(0.2, 0.2, 0.2) });
  });
  ctx.y -= 14;

  for (const p of points) {
    ensureSpace(ctx, 13);
    const ach =
      p.target > 0 ? `${Math.round((p.currentYear * 100) / p.target)}%` : '—';
    const values = [p.label, fmtSar(p.currentYear), fmtSar(p.lastYear), fmtSar(p.target), ach];
    values.forEach((v, i) => {
      ctx.page.drawText(v, { x: colX[i], y: ctx.y, size: 8, font: ctx.font, color: rgb(0.15, 0.15, 0.15) });
    });
    ctx.y -= 12;
  }
  ctx.y -= 8;
}

export async function buildStoreReportPdfBytes(payload: StoreReportPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 40;
  const ctx: PdfContext = {
    pdfDoc,
    font,
    fontBold,
    page: pdfDoc.addPage(PAGE_SIZE),
    y: PAGE_SIZE[1] - margin,
    margin,
  };

  drawReportHeader(ctx, payload.meta);
  ctx.y -= 6;

  const { storeDetail, ytdPerformance, meta } = payload;

  sectionTitle(ctx, 'SECTION 1 — Store Detail (MTD)');
  line(ctx, 'MTD Sales', fmtSar(storeDetail.kpis.mtdSales));
  line(ctx, 'vs Distributed Target', `${storeDetail.kpis.vsDistributedTargetPct}% (${fmtSar(storeDetail.kpis.distributedTarget)})`);
  line(ctx, 'vs Budget Target', `${storeDetail.kpis.vsBudgetTargetPct}% (${fmtSar(storeDetail.kpis.budgetTarget)})`);
  line(ctx, 'Discount', `${storeDetail.kpis.discountPct}%`);
  ctx.y -= 4;

  sectionTitle(ctx, 'Closing Expectation');
  line(ctx, 'MTD Performance', `${storeDetail.closingExpectation.mtdPerformancePct}%`);
  line(ctx, 'Run Rate (remaining month)', fmtSar(storeDetail.closingExpectation.runRateRemainingMonth));
  line(ctx, 'Pipeline Deals', fmtSar(storeDetail.closingExpectation.pipelineDeals));
  line(ctx, 'Projected Closing', fmtSar(storeDetail.closingExpectation.projectedClosing));
  line(ctx, 'Projected Achievement', `${storeDetail.closingExpectation.projectedAchievementPct}%`);
  ctx.y -= 4;

  sectionTitle(ctx, 'Team Performance');
  drawTeamTable(ctx, storeDetail.teamPerformance);

  const highlights = storeDetail.teamHighlights;
  sectionTitle(ctx, 'Team Highlights');
  line(
    ctx,
    'Top Performer',
    highlights.topPerformer
      ? `${highlights.topPerformer.name} (${highlights.topPerformer.achievementPct}%)`
      : '—'
  );
  line(
    ctx,
    'Needs Attention',
    highlights.laggingPerformer
      ? `${highlights.laggingPerformer.name} (${highlights.laggingPerformer.achievementPct}%)`
      : '—'
  );
  line(ctx, 'Employees Above Target', String(highlights.employeesAboveTarget));

  addPage(ctx);
  drawReportHeader(ctx, meta);
  ctx.y -= 6;

  sectionTitle(ctx, 'SECTION 2 — YTD Performance');
  line(ctx, 'Boutique YTD Revenue', fmtSar(ytdPerformance.boutique.revenueYtd));
  line(ctx, 'Boutique YTD Target', fmtSar(ytdPerformance.boutique.targetYtd));
  line(ctx, 'Boutique vs Last Year', fmtPct(ytdPerformance.boutique.vsLastYearPct));
  line(ctx, 'Boutique % of Target', fmtPct(ytdPerformance.boutique.pctOfTarget));
  ctx.y -= 4;

  const zoneLabel = ytdPerformance.zone.zoneName ?? 'Zone';
  sectionTitle(ctx, `Zone — ${zoneLabel}`);
  line(ctx, 'Zone YTD Revenue', fmtSar(ytdPerformance.zone.revenueYtd));
  line(ctx, 'Zone YTD Target', fmtSar(ytdPerformance.zone.targetYtd));
  line(ctx, 'Zone vs Last Year', fmtPct(ytdPerformance.zone.vsLastYearPct));
  line(ctx, 'Zone % of Target', fmtPct(ytdPerformance.zone.pctOfTarget));
  line(ctx, 'Boutique Share of Zone', fmtPct(ytdPerformance.zone.boutiqueShareOfZonePct));
  ctx.y -= 4;

  line(ctx, 'Boutique Snapshot', ytdPerformance.snapshot.boutiqueText.slice(0, 120));
  line(ctx, 'Zone Snapshot', ytdPerformance.snapshot.zoneText.slice(0, 120));
  ctx.y -= 4;

  drawMonthlyTable(ctx, 'Boutique Monthly Performance', ytdPerformance.charts.boutiqueMonthly);
  drawMonthlyTable(ctx, 'Zone Monthly Performance', ytdPerformance.charts.zoneMonthly);

  const { width } = ctx.page.getSize();
  ctx.page.drawText('Team Monitor · Confidential', {
    x: margin,
    y: 24,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  ctx.page.drawText(`Page ${pdfDoc.getPageCount()}`, {
    x: width - margin - 40,
    y: 24,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}

export function storeReportPdfFilename(meta: StoreReportPayload['meta']): string {
  const code = meta.boutiqueCode.replace(/[^\w-]+/g, '-');
  return `store-report-${code}-${meta.monthKey}.pdf`;
}
