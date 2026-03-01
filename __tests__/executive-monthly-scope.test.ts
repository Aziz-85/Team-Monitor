/**
 * Executive Monthly API: boutique scoping contract.
 * - GET /api/executive/monthly must use only session operational scope (getOperationalScope).
 * - Must NOT accept boutiqueId from client for data scope (SUPER_ADMIN may use ?b= for context; server validates).
 * - All queries (leaves, taskCompletions, sales, targets, etc.) must be scoped by operationalBoutiqueId.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.join(
  process.cwd(),
  'app',
  'api',
  'executive',
  'monthly',
  'route.ts'
);

describe('Executive Monthly API boutique scoping', () => {
  it('uses getOperationalScope for boutiqueId (no client boutiqueId for scope)', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('getOperationalScope(request)');
    expect(src).toContain('operationalBoutiqueId');
    expect(src).toContain('boutiqueFilter');
    // Must not use searchParams.get("boutiqueId") for data scope
    expect(src).not.toMatch(/searchParams\.get\s*\(\s*['"]boutiqueId['"]\s*\)/);
  });

  it('scopes leave counts by employee.boutiqueId', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('employee: { boutiqueId: operationalBoutiqueId }');
  });

  it('scopes taskCompletion by task.boutiqueId', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('task: { boutiqueId: operationalBoutiqueId }');
  });

  it('includes guard rail on sales sample boutiqueId', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('operationalBoutiqueId');
    expect(src).toContain('Scope leak');
    expect(src).toContain('403');
  });
});
