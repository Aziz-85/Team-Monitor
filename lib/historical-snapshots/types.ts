/**
 * Historical snapshot types (read-only JSON per boutique/month).
 * No Prisma; filesystem only.
 */

export type HistoricalSnapshotEmployee = {
  empId: string;
  name: string;
  netSales: number;
  invoices: number;
  pieces: number;
  achievementPct: number;
};

export type HistoricalSnapshotDay = {
  date: string;
  netSales: number;
  invoices: number;
  pieces: number;
  employees: HistoricalSnapshotEmployee[];
};

export type HistoricalSnapshotTotals = {
  netSales: number;
  invoices: number;
  pieces: number;
};

export type HistoricalSnapshot = {
  month: string;
  boutiqueId: string;
  daily: HistoricalSnapshotDay[];
  totals: HistoricalSnapshotTotals;
};
