/**
 * Boutique-aware target import templates (ExcelJS).
 * Data sheet headers must match import parsers exactly.
 */

import ExcelJS from 'exceljs';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { prisma } from '@/lib/db';
import {
  BOUTIQUE_HEADERS,
  BOUTIQUE_SHEET,
  EMPLOYEE_HEADERS,
  EMPLOYEE_SHEET,
} from './templates';
import type { TargetsTemplateBoutique } from './templateScope';
import { slugifyBoutiqueForFilename } from './templateScope';

const README_SHEET = 'README';
const METADATA_SHEET = '_METADATA';
const EMPLOYEES_REF_SHEET = 'Employees_Ref';

export type TargetTemplateMeta = {
  boutique: TargetsTemplateBoutique;
  templateType: 'boutique' | 'employee';
  month: string;
  generatedAt: string;
  generatedBy: string;
};

function nextMonthKeys(count: number, startMonth: string): string[] {
  const [y, m] = startMonth.split('-').map((x) => parseInt(x, 10));
  const out: string[] = [];
  let year = y;
  let month = m;
  for (let i = 0; i < count; i++) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function positionLabel(position: string | null | undefined): string {
  if (!position) return '';
  return position.replace(/_/g, ' ');
}

async function addMetadataSheet(workbook: ExcelJS.Workbook, meta: TargetTemplateMeta) {
  const sheet = workbook.addWorksheet(METADATA_SHEET);
  sheet.state = 'veryHidden';
  const rows: [string, string][] = [
    ['boutiqueId', meta.boutique.id],
    ['boutiqueCode', meta.boutique.code ?? ''],
    ['boutiqueName', meta.boutique.name ?? ''],
    ['generatedAt', meta.generatedAt],
    ['generatedBy', meta.generatedBy],
    ['templateType', meta.templateType],
    ['month', meta.month],
  ];
  sheet.addRow(['Key', 'Value']);
  for (const [key, value] of rows) {
    sheet.addRow([key, value]);
  }
}

async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function targetImportFilename(
  kind: 'boutique' | 'employee',
  boutique: Pick<TargetsTemplateBoutique, 'code' | 'name'>,
  month?: string
): string {
  const slug = slugifyBoutiqueForFilename(boutique);
  if (kind === 'boutique') {
    return `target-import-boutique-${slug}${month ? `-${month}` : ''}.xlsx`;
  }
  return `target-import-employee-${slug}-${month ?? 'month'}.xlsx`;
}

/** Boutique targets: 12 months from startMonth, one row per month for current boutique. */
export async function buildBoutiqueTargetsImportTemplate(input: {
  boutique: TargetsTemplateBoutique;
  startMonth: string;
  generatedBy: string;
}): Promise<Buffer> {
  const { boutique, startMonth, generatedBy } = input;
  const code = (boutique.code ?? '').trim();
  const name = (boutique.name ?? '').trim();
  const months = nextMonthKeys(12, startMonth);
  const generatedAt = new Date().toISOString();

  const workbook = new ExcelJS.Workbook();
  const dataSheet = workbook.addWorksheet(BOUTIQUE_SHEET);
  dataSheet.addRow(BOUTIQUE_HEADERS);
  for (const mk of months) {
    dataSheet.addRow([mk, code, name, '', 'OFFICIAL', '']);
  }

  const readme = workbook.addWorksheet(README_SHEET);
  readme.addRows([
    ['CURRENT BOUTIQUE TARGET TEMPLATE'],
    [],
    ['boutiqueId', boutique.id],
    ['boutiqueCode', code],
    ['boutiqueName', name],
    ['startMonth', startMonth],
    [],
    ['Instructions:'],
    ['- Edit Target column only (integer SAR, no decimals).'],
    ['- Do not change Month, ScopeId, BoutiqueName, column order, or sheet name.'],
    ['- Sheet name must remain:', BOUTIQUE_SHEET],
    ['- One row per month for your current boutique.'],
    ['- Source defaults to OFFICIAL; Notes are optional.'],
    [],
    ['Import: POST /api/targets/import/boutiques/preview then /api/targets/import/boutiques/apply'],
  ]);

  await addMetadataSheet(workbook, {
    boutique,
    templateType: 'boutique',
    month: startMonth,
    generatedAt,
    generatedBy,
  });

  return workbookToBuffer(workbook);
}

/** Employee targets: one row per active employee for the selected month. */
export async function buildEmployeeTargetsImportTemplate(input: {
  boutique: TargetsTemplateBoutique;
  month: string;
  generatedBy: string;
}): Promise<Buffer> {
  const { boutique, month, generatedBy } = input;
  const code = (boutique.code ?? '').trim();
  const bname = (boutique.name ?? '').trim();
  const generatedAt = new Date().toISOString();

  const employees = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational([boutique.id]),
    select: { empId: true, name: true, position: true },
    orderBy: employeeOrderByStable,
  });

  const workbook = new ExcelJS.Workbook();
  const dataSheet = workbook.addWorksheet(EMPLOYEE_SHEET);
  dataSheet.addRow(EMPLOYEE_HEADERS);
  for (const e of employees) {
    dataSheet.addRow([
      month,
      code,
      bname,
      (e.empId ?? '').trim(),
      (e.name ?? '').trim(),
      '',
      'OFFICIAL',
      '',
    ]);
  }

  const refSheet = workbook.addWorksheet(EMPLOYEES_REF_SHEET);
  refSheet.addRow(['EmpId', 'Name', 'Position', 'Note']);
  for (const e of employees) {
    refSheet.addRow([
      (e.empId ?? '').trim(),
      (e.name ?? '').trim(),
      positionLabel(e.position),
      'Reference only — import uses EMPLOYEE_TARGETS sheet.',
    ]);
  }

  const readme = workbook.addWorksheet(README_SHEET);
  readme.addRows([
    ['CURRENT BOUTIQUE EMPLOYEE TARGET TEMPLATE'],
    [],
    ['boutiqueId', boutique.id],
    ['boutiqueCode', code],
    ['boutiqueName', bname],
    ['month', month],
    ['employeeCount', String(employees.length)],
    [],
    ['Instructions:'],
    ['- Edit Target column only (integer SAR, no decimals).'],
    ['- Do not change EmployeeCode (empId), column order, or sheet name.'],
    ['- Sheet name must remain:', EMPLOYEE_SHEET],
    ['- EmployeeCode is the stable key; names may change.'],
    ['- See Employees_Ref for position labels (not imported).'],
    [],
    ['Import: POST /api/targets/import/employees/preview then /api/targets/import/employees/apply'],
  ]);

  await addMetadataSheet(workbook, {
    boutique,
    templateType: 'employee',
    month,
    generatedAt,
    generatedBy,
  });

  return workbookToBuffer(workbook);
}
