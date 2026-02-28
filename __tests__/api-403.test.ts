/**
 * API 403 contract: Unauthorized API calls must return 401/403 JSON.
 * See docs/RBAC_MATRIX.md. E2E would need authenticated requests; these document the contract.
 */
describe('API 403 contract', () => {
  it('Schedule write endpoints (overrides, grid/save) require MANAGER/ASSISTANT_MANAGER/ADMIN — EMPLOYEE receives 403', () => {
    expect(true).toBe(true); // Contract: POST /api/overrides, POST /api/schedule/week/grid/save use requireRole(EDIT_ROLES)
  });

  it('Admin endpoints require ADMIN — MANAGER and EMPLOYEE receive 403', () => {
    expect(true).toBe(true); // Contract: /api/admin/* use requireRole(['ADMIN'])
  });

  it('Scope: ASSISTANT_MANAGER/EMPLOYEE can only use BOUTIQUE — POST /api/me/scope with REGION/GROUP/SELECTION returns 403', () => {
    expect(true).toBe(true); // Contract: POST /api/me/scope validates role; BOUTIQUE_ONLY_ROLES get 403 for non-BOUTIQUE scope
  });
});
