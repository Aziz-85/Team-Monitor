/**
 * Operational roster: Employee.boutiqueId is the only source of truth.
 * getOperationalEmployees / assertEmployeesInBoutiqueScope / getOperationalEmpIds.
 */

import {
  getOperationalEmployees,
  getOperationalEmpIds,
  assertEmployeeInBoutiqueScope,
  assertEmployeesInBoutiqueScope,
  EmployeeOutOfScopeError,
} from '@/lib/tenancy/operationalRoster';

describe('Operational roster', () => {
  describe('getOperationalEmployees', () => {
    it('returns empty array when boutiqueIds is empty', async () => {
      const list = await getOperationalEmployees([]);
      expect(list).toEqual([]);
    });

    it('returns only employees in given boutiques when boutiqueIds has no-match', async () => {
      const list = await getOperationalEmployees(['bout_nonexistent_roster_test_xyz']);
      expect(list).toHaveLength(0);
    });
  });

  describe('getOperationalEmpIds', () => {
    it('returns empty set when boutiqueIds is empty', async () => {
      const set = await getOperationalEmpIds([]);
      expect(set.size).toBe(0);
    });
  });

  describe('assertEmployeeInBoutiqueScope', () => {
    it('throws EmployeeOutOfScopeError when employee has different boutiqueId', async () => {
      const fakeEmpId = 'emp_roster_test_nonexistent_999';
      await expect(
        assertEmployeeInBoutiqueScope(fakeEmpId, ['bout_dhhrn_001'])
      ).rejects.toThrow(EmployeeOutOfScopeError);
    });

    it('throws when boutiqueIds is empty', async () => {
      await expect(
        assertEmployeeInBoutiqueScope('any', [])
      ).rejects.toThrow(EmployeeOutOfScopeError);
    });
  });

  describe('assertEmployeesInBoutiqueScope', () => {
    it('throws with invalidEmpIds when one employee is out of scope', async () => {
      const fakeEmpId = 'emp_roster_test_nonexistent_998';
      await expect(
        assertEmployeesInBoutiqueScope([fakeEmpId], ['bout_dhhrn_001'])
      ).rejects.toMatchObject({
        name: 'EmployeeOutOfScopeError',
        code: 'CROSS_BOUTIQUE_BLOCKED',
        empId: fakeEmpId,
      });
    });
  });
});
