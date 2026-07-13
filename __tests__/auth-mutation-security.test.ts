const requireSessionMock = jest.fn();

jest.mock('@/lib/auth', () => {
  class AuthError extends Error {
    constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN') {
      super(code);
    }
  }
  return {
    AuthError,
    getSessionUser: jest.fn(),
    requireRole: jest.fn(),
    requireSession: (...args: unknown[]) => requireSessionMock(...args),
  };
});

import { requireMutableUser } from '@/lib/auth/index';

describe('mutation authentication defense in depth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects DEMO_VIEWER mutation even if middleware is bypassed', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'demo-1',
      role: 'DEMO_VIEWER',
      boutiqueId: 'b1',
      disabled: false,
    });
    await expect(requireMutableUser()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('allows an authenticated non-demo user to continue to authorization', async () => {
    const user = {
      id: 'manager-1',
      role: 'MANAGER',
      boutiqueId: 'b1',
      disabled: false,
    };
    requireSessionMock.mockResolvedValue(user);
    await expect(requireMutableUser()).resolves.toBe(user);
  });
});
