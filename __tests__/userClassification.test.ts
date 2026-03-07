/**
 * User classification: technical vs operational accounts.
 */

import {
  normalizeEmployeeId,
  isNumericEmployeeId,
  isReservedSystemEmpId,
  isTechnicalEmpId,
  isTechnicalAccount,
  isOperationalUser,
  isOperationalEmployee,
  filterOperationalEmployees,
} from '@/lib/userClassification';

describe('userClassification', () => {
  describe('normalizeEmployeeId', () => {
    it('trims whitespace', () => {
      expect(normalizeEmployeeId(' 1205 ')).toBe('1205');
    });
    it('returns empty string for null/undefined', () => {
      expect(normalizeEmployeeId(null)).toBe('');
      expect(normalizeEmployeeId(undefined)).toBe('');
    });
  });

  describe('isNumericEmployeeId', () => {
    it('"1205" => true', () => expect(isNumericEmployeeId('1205')).toBe(true));
    it('" 1205 " => true', () => expect(isNumericEmployeeId(' 1205 ')).toBe(true));
    it('"admin" => false', () => expect(isNumericEmployeeId('admin')).toBe(false));
    it('"SYS_SYSTEM" => false', () => expect(isNumericEmployeeId('SYS_SYSTEM')).toBe(false));
    it('missing empId => false', () => {
      expect(isNumericEmployeeId('')).toBe(false);
      expect(isNumericEmployeeId(null)).toBe(false);
    });
  });

  describe('isReservedSystemEmpId', () => {
    it('"admin" => true', () => expect(isReservedSystemEmpId('admin')).toBe(true));
    it('"super_admin" => true', () => expect(isReservedSystemEmpId('super_admin')).toBe(true));
    it('"SYS_SYSTEM" => true', () => expect(isReservedSystemEmpId('SYS_SYSTEM')).toBe(true));
    it('"1205" => false', () => expect(isReservedSystemEmpId('1205')).toBe(false));
  });

  describe('isTechnicalEmpId', () => {
    it('"admin" => technical', () => expect(isTechnicalEmpId('admin')).toBe(true));
    it('"super_admin" => technical', () => expect(isTechnicalEmpId('super_admin')).toBe(true));
    it('"SYS_SYSTEM" => technical', () => expect(isTechnicalEmpId('SYS_SYSTEM')).toBe(true));
    it('missing => technical', () => {
      expect(isTechnicalEmpId(null)).toBe(true);
      expect(isTechnicalEmpId('')).toBe(true);
    });
    it('"admin_rashid" => technical', () => expect(isTechnicalEmpId('admin_rashid')).toBe(true));
    it('"sys_bot" => technical', () => expect(isTechnicalEmpId('sys_bot')).toBe(true));
    it('"1205" => not technical', () => expect(isTechnicalEmpId('1205')).toBe(false));
  });

  describe('isTechnicalAccount', () => {
    it('role SUPER_ADMIN => technical', () => {
      expect(isTechnicalAccount({ empId: '1205', role: 'SUPER_ADMIN' })).toBe(true);
    });
    it('role ADMIN => technical', () => {
      expect(isTechnicalAccount({ empId: '1205', role: 'ADMIN' })).toBe(true);
    });
    it('missing empId => technical', () => {
      expect(isTechnicalAccount({ empId: '', role: 'EMPLOYEE' })).toBe(true);
    });
    it('numeric empId + EMPLOYEE => not technical', () => {
      expect(isTechnicalAccount({ empId: '1205', role: 'EMPLOYEE' })).toBe(false);
    });
  });

  describe('isOperationalUser', () => {
    it('1205 + EMPLOYEE => operational', () => {
      expect(isOperationalUser({ empId: '1205', role: 'EMPLOYEE' })).toBe(true);
    });
    it('ADMIN => not operational', () => {
      expect(isOperationalUser({ empId: '1205', role: 'ADMIN' })).toBe(false);
    });
  });

  describe('isOperationalEmployee', () => {
    it('isSystemOnly true => not operational', () => {
      expect(isOperationalEmployee({ empId: '1205', isSystemOnly: true })).toBe(false);
    });
    it('admin empId => not operational', () => {
      expect(isOperationalEmployee({ empId: 'admin', isSystemOnly: false })).toBe(false);
    });
    it('1205 + isSystemOnly false => operational', () => {
      expect(isOperationalEmployee({ empId: '1205', isSystemOnly: false })).toBe(true);
    });
  });

  describe('filterOperationalEmployees', () => {
    it('excludes technical accounts', () => {
      const list = [
        { empId: '1205', isSystemOnly: false },
        { empId: 'admin', isSystemOnly: false },
        { empId: '1102', isSystemOnly: false },
      ];
      const out = filterOperationalEmployees(list);
      expect(out).toHaveLength(2);
      expect(out.map((e) => e.empId)).toEqual(['1205', '1102']);
    });
  });
});
