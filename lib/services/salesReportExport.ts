/**
 * Sales export workbook for Reports Export Center.
 * Data from SalesEntry, SalesTransaction, and monthly targets (Prisma).
 */

import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { addSheetFromRows } from '@/lib/services/scheduleFullExport';
import {
  dayName,
  getDatesInRange,
  halalasToSar,
  pctAchieved,
} from '@/lib/services/reportExportCommon';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';

export type SalesReportExportOptions = {
  startDate: string;
  endDate: string;
  boutiqueIds: string[];
  boutiqueLabelsById: Map<string, string>;
  userId?: string;
  includeSummary: boolean;
  includeDaily: boolean;
  includeEmployee: boolean;
  includeBoutique: boolean;
  includeDiscounts: boolean;
  includePaymentDetails: boolean;
};

type DetailRow = Record<string, string | number>;

function monthsInRange(startDate: string, endDate: string): string[] {
  const set = new Set<string>();
  for (const d of getDatesInRange(startDate, endDate)) {
    set.add(d.slice(0, 7));
  }
  return Array.from(set).sort();
}

export async function buildSalesReportExportWorkbook(
  options: SalesReportExportOptions
): Promise<{ buffer: ArrayBuffer; startDate: string; endDate: string }> {
  const { startDate, endDate, boutiqueIds, boutiqueLabelsById, userId } = options;
  const from = parseDateRiyadh(startDate);
  const to = parseDateRiyadh(endDate);
  const monthKeys = monthsInRange(startDate, endDate);

  let employeeIdFilter: string[] | undefined;
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { empId: true } });
    employeeIdFilter = u?.empId ? [u.empId] : [];
  }

  const [entries, transactions, boutiqueTargets, employeeTargets, employees, users] =
    await Promise.all([
      prisma.salesEntry.findMany({
        where: {
          dateKey: { gte: startDate, lte: endDate },
          boutiqueId: { in: boutiqueIds },
          ...(userId ? { userId } : {}),
        },
        orderBy: [{ dateKey: 'asc' }, { boutiqueId: 'asc' }],
        select: {
          dateKey: true,
          boutiqueId: true,
          userId: true,
          amount: true,
          invoiceCount: true,
          pieceCount: true,
          source: true,
          user: {
            select: {
              empId: true,
              employee: { select: { name: true } },
            },
          },
        },
      }),
      prisma.salesTransaction.findMany({
        where: {
          txnDate: { gte: from, lte: to },
          boutiqueId: { in: boutiqueIds },
          ...(employeeIdFilter ? { employeeId: { in: employeeIdFilter } } : {}),
        },
        orderBy: [{ txnDate: 'asc' }, { boutiqueId: 'asc' }],
        select: {
          txnDate: true,
          boutiqueId: true,
          employeeId: true,
          type: true,
          source: true,
          referenceNo: true,
          lineNo: true,
          grossAmount: true,
          netAmount: true,
          isGuestCoverage: true,
          coverageShift: true,
          employee: { select: { name: true } },
        },
      }),
      prisma.boutiqueMonthlyTarget.findMany({
        where: { boutiqueId: { in: boutiqueIds }, month: { in: monthKeys } },
        select: { boutiqueId: true, month: true, amount: true },
      }),
      prisma.employeeMonthlyTarget.findMany({
        where: {
          boutiqueId: { in: boutiqueIds },
          month: { in: monthKeys },
          ...(userId ? { userId } : {}),
        },
        select: { userId: true, boutiqueId: true, month: true, amount: true },
      }),
      prisma.employee.findMany({
        where: { boutiqueId: { in: boutiqueIds }, active: true },
        select: { empId: true, name: true },
      }),
      prisma.user.findMany({
        where: { employee: { boutiqueId: { in: boutiqueIds } } },
        select: { id: true, empId: true, employee: { select: { name: true } } },
      }),
    ]);

  const empNameByEmpId = new Map(employees.map((e) => [e.empId, e.name]));
  const userNameById = new Map(
    users.map((u) => [u.id, u.employee?.name ?? empNameByEmpId.get(u.empId ?? '') ?? ''])
  );
  const userIdByEmpId = new Map(users.filter((u) => u.empId).map((u) => [u.empId!, u.id]));
  void userIdByEmpId;

  const boutiqueTargetMap = new Map(
    boutiqueTargets.map((t) => [`${t.boutiqueId}:${t.month}`, t.amount])
  );
  const employeeTargetMap = new Map(
    employeeTargets.map((t) => [`${t.userId}:${t.boutiqueId}:${t.month}`, t.amount])
  );

  const dailyDetailRows: DetailRow[] = entries.map((e) => {
    const month = e.dateKey.slice(0, 7);
    const target =
      employeeTargetMap.get(`${e.userId}:${e.boutiqueId}:${month}`) ??
      boutiqueTargetMap.get(`${e.boutiqueId}:${month}`) ??
      0;
    const employeeName = e.user.employee?.name ?? userNameById.get(e.userId) ?? '';
    const net = e.amount;
    return {
      Date: e.dateKey,
      Boutique: boutiqueLabelsById.get(e.boutiqueId) ?? e.boutiqueId,
      Employee: employeeName,
      'Invoice / Reference': e.invoiceCount != null ? String(e.invoiceCount) : '',
      'Gross Sales': net,
      Discount: '',
      'Net Sales': net,
      Target: target || '',
      'Achievement %': pctAchieved(net, target),
      Notes: e.source ?? '',
    };
  });

  dailyDetailRows.sort((a, b) => {
    const d = String(a.Date).localeCompare(String(b.Date));
    if (d !== 0) return d;
    return String(a.Employee).localeCompare(String(b.Employee), undefined, { sensitivity: 'base' });
  });

  const summaryByDateBoutique = new Map<string, { net: number; gross: number; discount: number }>();
  for (const e of entries) {
    const key = `${e.dateKey}:${e.boutiqueId}`;
    const cur = summaryByDateBoutique.get(key) ?? { net: 0, gross: 0, discount: 0 };
    cur.net += e.amount;
    cur.gross += e.amount;
    summaryByDateBoutique.set(key, cur);
  }

  for (const tx of transactions) {
    const dateStr = tx.txnDate.toISOString().slice(0, 10);
    const key = `${dateStr}:${tx.boutiqueId}`;
    const net = halalasToSar(tx.netAmount);
    const gross = halalasToSar(tx.grossAmount);
    const discount = Math.max(0, gross - net);
    const cur = summaryByDateBoutique.get(key);
    if (cur && discount > 0) {
      cur.discount += discount;
      cur.gross = Math.max(cur.gross, cur.net + cur.discount);
    }
  }

  const summaryRows: DetailRow[] = Array.from(summaryByDateBoutique.entries())
    .map(([key, v]) => {
      const [date, boutiqueId] = key.split(':');
      const month = date!.slice(0, 7);
      const target = boutiqueTargetMap.get(`${boutiqueId}:${month}`) ?? 0;
      return {
        Date: date!,
        Day: dayName(date!),
        Boutique: boutiqueLabelsById.get(boutiqueId!) ?? boutiqueId!,
        'Gross Sales': v.gross,
        Discount: v.discount || '',
        'Net Sales': v.net,
        Target: target || '',
        'Achievement %': pctAchieved(v.net, target),
      };
    })
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

  const employeeAgg = new Map<string, { name: string; net: number; gross: number; discount: number }>();
  for (const e of entries) {
    const key = e.userId;
    const name = e.user.employee?.name ?? userNameById.get(e.userId) ?? '';
    const cur = employeeAgg.get(key) ?? { name, net: 0, gross: 0, discount: 0 };
    cur.net += e.amount;
    cur.gross += e.amount;
    employeeAgg.set(key, cur);
  }
  const employeeRows: DetailRow[] = Array.from(employeeAgg.entries())
    .map(([uid, v]) => {
      const month = monthKeys[monthKeys.length - 1] ?? startDate.slice(0, 7);
      const target =
        employeeTargets
          .filter((t) => t.userId === uid)
          .reduce((s, t) => s + t.amount, 0) ||
        boutiqueTargets.reduce((s, t) => s + t.amount, 0);
      void month;
      return {
        Employee: v.name,
        'Gross Sales': v.gross,
        Discount: v.discount || '',
        'Net Sales': v.net,
        Target: target || '',
        'Achievement %': pctAchieved(v.net, target),
      };
    })
    .sort((a, b) => String(a.Employee).localeCompare(String(b.Employee), undefined, { sensitivity: 'base' }));

  const boutiqueAgg = new Map<string, { net: number; gross: number; discount: number }>();
  for (const e of entries) {
    const cur = boutiqueAgg.get(e.boutiqueId) ?? { net: 0, gross: 0, discount: 0 };
    cur.net += e.amount;
    cur.gross += e.amount;
    boutiqueAgg.set(e.boutiqueId, cur);
  }
  const boutiqueRows: DetailRow[] = Array.from(boutiqueAgg.entries())
    .map(([bid, v]) => {
      const target = employeeTargets
        .filter((t) => t.boutiqueId === bid)
        .reduce((s, t) => s + t.amount, 0);
      return {
        Boutique: boutiqueLabelsById.get(bid) ?? bid,
        'Gross Sales': v.gross,
        Discount: v.discount || '',
        'Net Sales': v.net,
        Target: target || '',
        'Achievement %': pctAchieved(v.net, target),
      };
    })
    .sort((a, b) => String(a.Boutique).localeCompare(String(b.Boutique)));

  const discountRows: DetailRow[] = transactions
    .filter((tx) => tx.grossAmount > tx.netAmount)
    .map((tx) => {
      const dateStr = tx.txnDate.toISOString().slice(0, 10);
      const gross = halalasToSar(tx.grossAmount);
      const net = halalasToSar(tx.netAmount);
      return {
        Date: dateStr,
        Boutique: boutiqueLabelsById.get(tx.boutiqueId) ?? tx.boutiqueId,
        Employee: tx.employee.name,
        'Invoice / Reference': tx.referenceNo ?? tx.lineNo ?? '',
        'Gross Sales': gross,
        Discount: gross - net,
        'Net Sales': net,
        Type: tx.type,
      };
    })
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

  const paymentRows: DetailRow[] = transactions
    .map((tx) => {
      const dateStr = tx.txnDate.toISOString().slice(0, 10);
      const gross = halalasToSar(tx.grossAmount);
      const net = halalasToSar(tx.netAmount);
      const notes: string[] = [];
      if (tx.isGuestCoverage) notes.push('Guest coverage');
      if (tx.coverageShift) notes.push(`Shift ${tx.coverageShift}`);
      return {
        Date: dateStr,
        Boutique: boutiqueLabelsById.get(tx.boutiqueId) ?? tx.boutiqueId,
        Employee: tx.employee.name,
        'Invoice / Reference': tx.referenceNo ?? tx.lineNo ?? '',
        'Gross Sales': gross,
        Discount: gross > net ? gross - net : '',
        'Net Sales': net,
        Source: tx.source,
        Type: tx.type,
        Notes: notes.join('; '),
      };
    })
    .sort((a, b) => String(a.Date).localeCompare(String(b.Date)));


  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Team Monitor';
  workbook.created = new Date();

  if (options.includeSummary) {
    addSheetFromRows(
      workbook,
      'Sales Summary',
      ['Date', 'Day', 'Boutique', 'Gross Sales', 'Discount', 'Net Sales', 'Target', 'Achievement %'],
      summaryRows
    );
  }

  if (options.includeDaily) {
    addSheetFromRows(
      workbook,
      'Daily Sales',
      [
        'Date',
        'Boutique',
        'Employee',
        'Invoice / Reference',
        'Gross Sales',
        'Discount',
        'Net Sales',
        'Target',
        'Achievement %',
        'Notes',
      ],
      dailyDetailRows
    );
  }

  if (options.includeEmployee) {
    addSheetFromRows(
      workbook,
      'Employee Sales',
      ['Employee', 'Gross Sales', 'Discount', 'Net Sales', 'Target', 'Achievement %'],
      employeeRows
    );
  }

  if (options.includeBoutique) {
    addSheetFromRows(
      workbook,
      'Boutique Sales',
      ['Boutique', 'Gross Sales', 'Discount', 'Net Sales', 'Target', 'Achievement %'],
      boutiqueRows
    );
  }

  if (options.includeDiscounts && discountRows.length > 0) {
    addSheetFromRows(
      workbook,
      'Discounts',
      ['Date', 'Boutique', 'Employee', 'Invoice / Reference', 'Gross Sales', 'Discount', 'Net Sales', 'Type'],
      discountRows
    );
  }

  if (options.includePaymentDetails && paymentRows.length > 0) {
    addSheetFromRows(
      workbook,
      'Payment Source Details',
      [
        'Date',
        'Boutique',
        'Employee',
        'Invoice / Reference',
        'Gross Sales',
        'Discount',
        'Net Sales',
        'Source',
        'Type',
        'Notes',
      ],
      paymentRows
    );
  }

  if (workbook.worksheets.length === 0) {
    addSheetFromRows(workbook, 'Sales Summary', ['Date', 'Note'], [
      { Date: startDate, Note: 'No data in selected range' },
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, startDate, endDate };
}
