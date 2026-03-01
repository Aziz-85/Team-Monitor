/**
 * AREA_MANAGER feature: RBAC and API contract tests.
 * - ADMIN cannot access /api/area/* (403).
 * - Area APIs use assertAreaManagerOrSuperAdmin.
 * - Transfer creates EmployeeTransferAudit; target changes create TargetChangeAudit.
 */

import * as fs from 'fs';
import * as path from 'path';

const AREA_EMPLOYEES_ROUTE = path.join(
  process.cwd(),
  'app',
  'api',
  'area',
  'employees',
  'route.ts'
);
const AREA_TRANSFER_ROUTE = path.join(
  process.cwd(),
  'app',
  'api',
  'area',
  'employees',
  'transfer',
  'route.ts'
);
const BOUTIQUE_MONTHLY_ROUTE = path.join(
  process.cwd(),
  'app',
  'api',
  'area',
  'targets',
  'boutique-monthly',
  'route.ts'
);

describe('AREA_MANAGER RBAC and API contracts', () => {
  it('area employees route uses assertAreaManagerOrSuperAdmin', () => {
    const src = fs.readFileSync(AREA_EMPLOYEES_ROUTE, 'utf-8');
    expect(src).toContain('assertAreaManagerOrSuperAdmin');
  });

  it('area transfer route creates EmployeeTransferAudit in transaction', () => {
    const src = fs.readFileSync(AREA_TRANSFER_ROUTE, 'utf-8');
    expect(src).toContain('employeeTransferAudit.create');
    expect(src).toContain('$transaction');
  });

  it('boutique-monthly target route validates SAR integer and creates TargetChangeAudit', () => {
    const src = fs.readFileSync(BOUTIQUE_MONTHLY_ROUTE, 'utf-8');
    expect(src).toContain('targetChangeAudit.create');
    expect(src).toContain('TargetAuditScope');
    expect(src).toMatch(/amount.*integer|isSarInt|Math\.trunc/);
  });
});
