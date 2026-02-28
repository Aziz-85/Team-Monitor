import * as XLSX from 'xlsx';
import { extractTaskKeyFromTitle } from './taskKey';

export type PlannerImportRow = {
  taskKey: string | null;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  status: 'DONE' | 'NOT_DONE' | 'UNKNOWN';
  completedAtRaw: string | null;
};

/** Excel serial date to ISO date string (YYYY-MM-DD) or datetime. */
function excelDateToISO(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = new Date((value - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Excel serial or string to ISO datetime for Completed Date (for anti-gaming). */
function excelCompletedAtRaw(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = new Date((value - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Parse XLSX buffer from Planner export. Sheet "Tasks" (fallback: first sheet).
 * Headers: Task ID, Task Name, Bucket Name, Progress, Priority, Assigned To, ... Due date, ... Completed Date, ...
 */
export function parsePlannerXlsx(buffer: ArrayBuffer): PlannerImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames.includes('Tasks') ? 'Tasks' : workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) return [];
  const headers = (rows[0] as unknown[]).map((h) => String(h ?? '').trim());
  const col = (name: string) => {
    const i = headers.findIndex((h) => h === name || h.toLowerCase() === name.toLowerCase());
    return i >= 0 ? i : -1;
  };
  const taskNameIdx = col('Task Name');
  if (taskNameIdx < 0) return [];
  const assignedToIdx = col('Assigned To');
  const dueDateIdx = col('Due date');
  const progressIdx = col('Progress');
  const completedDateIdx = col('Completed Date');

  const result: PlannerImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const title = String(row[taskNameIdx] ?? '').trim();
    if (!title) continue;
    const taskKey = extractTaskKeyFromTitle(title);
    const assignee = assignedToIdx >= 0 && row[assignedToIdx] != null ? String(row[assignedToIdx]).trim() || null : null;
    const dueVal = dueDateIdx >= 0 ? row[dueDateIdx] : null;
    const dueDate = excelDateToISO(dueVal);
    const completedVal = completedDateIdx >= 0 ? row[completedDateIdx] : null;
    const completedAtRaw = excelCompletedAtRaw(completedVal);
    const progress = progressIdx >= 0 ? String(row[progressIdx] ?? '').trim().toLowerCase() : '';
    const status: 'DONE' | 'NOT_DONE' | 'UNKNOWN' =
      progress === 'completed' || completedAtRaw != null ? 'DONE' : progress === 'not started' || progress === '0' ? 'NOT_DONE' : 'UNKNOWN';
    result.push({ taskKey, title, assignee, dueDate, status, completedAtRaw });
  }
  return result;
}

/**
 * Parse Planner file: XLSX (primary) or CSV (fallback) by extension or content.
 */
export function parsePlannerFile(buffer: ArrayBuffer, filename: string): PlannerImportRow[] {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.xlsx')) {
    return parsePlannerXlsx(buffer);
  }
  const text = new TextDecoder('utf-8').decode(buffer);
  return parsePlannerCsv(text);
}

/**
 * Parse CSV text from Planner export. Expects header row.
 * Tries to find columns: Title, Assigned To / Assignee, Due Date, Status / % Complete / Completed.
 */
export function parsePlannerCsv(csvText: string): PlannerImportRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let inQuotes = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
        out.push(cell.trim());
        cell = '';
        if (c === '\n') break;
      } else {
        cell += c;
      }
    }
    out.push(cell.trim());
    return out;
  };
  const headers = parseRow(lines[0]);
  const hi = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name));
  const titleIdx = hi('title') >= 0 ? hi('title') : 0;
  const assigneeIdx = hi('assigned') >= 0 ? hi('assigned') : hi('assignee') >= 0 ? hi('assignee') : -1;
  const dueIdx = hi('due') >= 0 ? hi('due') : -1;
  const statusIdx = hi('status') >= 0 ? hi('status') : hi('complete') >= 0 ? hi('complete') : hi('completed') >= 0 ? hi('completed') : -1;
  const completedAtIdx = hi('completed at') >= 0 ? hi('completed at') : hi('completedat') >= 0 ? hi('completedat') : -1;

  const rows: PlannerImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    const title = cells[titleIdx] ?? '';
    if (!title) continue;
    const taskKey = extractTaskKeyFromTitle(title);
    const assignee = assigneeIdx >= 0 && cells[assigneeIdx] !== undefined ? cells[assigneeIdx] : null;
    const dueDate = dueIdx >= 0 && cells[dueIdx] !== undefined ? cells[dueIdx] : null;
    const completedAtRaw = completedAtIdx >= 0 && cells[completedAtIdx] !== undefined ? cells[completedAtIdx] : null;
    let status: 'DONE' | 'NOT_DONE' | 'UNKNOWN' = 'UNKNOWN';
    if (completedAtRaw != null && String(completedAtRaw).trim()) status = 'DONE';
    else if (statusIdx >= 0 && cells[statusIdx] !== undefined) {
      const v = String(cells[statusIdx]).toLowerCase();
      if (v === 'done' || v === 'completed' || v === '100' || v === 'yes' || v === 'true') status = 'DONE';
      else if (v === 'not done' || v === 'not started' || v === '0' || v === 'no' || v === 'false') status = 'NOT_DONE';
    }
    rows.push({ taskKey, title, assignee, dueDate, status, completedAtRaw });
  }
  return rows;
}

export type CompareRow = {
  taskKey: string | null;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  siteStatus: 'DONE' | 'NOT_DONE';
  plannerStatus: 'DONE' | 'NOT_DONE' | 'UNKNOWN';
  matchStatus: 'matched' | 'planner_done_apply' | 'site_done_only' | 'conflict' | 'missing_key' | 'suspicious';
  siteTaskId?: string | null;
  siteCompletedAt?: string | null;
  plannerCompletedAtRaw?: string | null;
  flags?: Record<string, unknown>;
};

export type CompareResult = {
  matched: CompareRow[];
  plannerDoneApply: CompareRow[];
  siteDoneOnly: CompareRow[];
  conflicts: CompareRow[];
  missingKey: CompareRow[];
  suspicious: CompareRow[];
};

export type SiteTaskOccurrence = {
  taskKey: string;
  taskId: string;
  dueDate: string;
  assigneeEmpId: string | null;
  assigneeName: string | null;
  siteDone: boolean;
  siteCompletedAt: string | null;
  title: string;
};

/**
 * Compare planner import rows to site state. Apply anti-gaming flags.
 */
export function runCompare(
  siteState: SiteTaskOccurrence[],
  plannerRows: PlannerImportRow[],
  rowFlags: Map<number, Record<string, unknown>>
): CompareResult {
  const siteByKeyAndDue = new Map<string, SiteTaskOccurrence>();
  for (const s of siteState) {
    siteByKeyAndDue.set(`${s.taskKey}\t${s.dueDate}`, s);
  }
  const matched: CompareRow[] = [];
  const plannerDoneApply: CompareRow[] = [];
  const siteDoneOnly: CompareRow[] = [];
  const conflicts: CompareRow[] = [];
  const missingKey: CompareRow[] = [];
  const suspicious: CompareRow[] = [];

  for (let i = 0; i < plannerRows.length; i++) {
    const p = plannerRows[i];
    const flags = rowFlags.get(i);
    const base: CompareRow = {
      taskKey: p.taskKey,
      title: p.title,
      assignee: p.assignee,
      dueDate: p.dueDate,
      siteStatus: 'NOT_DONE',
      plannerStatus: p.status,
      matchStatus: 'matched',
      plannerCompletedAtRaw: p.completedAtRaw,
      flags: flags ?? undefined,
    };

    if (!p.taskKey || !p.taskKey.trim()) {
      base.matchStatus = 'missing_key';
      missingKey.push(base);
      if (flags) suspicious.push({ ...base, matchStatus: 'suspicious' });
      continue;
    }

    const dueNorm = (p.dueDate ?? '').slice(0, 10);
    const site = dueNorm ? siteByKeyAndDue.get(`${p.taskKey}\t${dueNorm}`) : null;

    if (!site) {
      base.matchStatus = 'conflict';
      base.siteStatus = 'NOT_DONE';
      conflicts.push(base);
      if (flags) suspicious.push({ ...base, matchStatus: 'suspicious' });
      continue;
    }

    base.siteTaskId = site.taskId;
    base.siteCompletedAt = site.siteCompletedAt;
    base.siteStatus = site.siteDone ? 'DONE' : 'NOT_DONE';

    if (flags) {
      suspicious.push({ ...base, matchStatus: 'suspicious' });
    }

    if (p.status === 'DONE' && site.siteDone) {
      base.matchStatus = 'matched';
      matched.push(base);
    } else if (p.status === 'DONE' && !site.siteDone) {
      base.matchStatus = 'planner_done_apply';
      plannerDoneApply.push(base);
    } else if (!site.siteDone) {
      base.matchStatus = 'matched';
      matched.push(base);
    } else {
      base.matchStatus = 'site_done_only';
      siteDoneOnly.push(base);
    }
  }

  return { matched, plannerDoneApply, siteDoneOnly, conflicts, missingKey, suspicious };
}
