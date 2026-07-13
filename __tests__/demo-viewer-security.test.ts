/**
 * Phase 7 — DEMO_VIEWER read-only enforcement (handler + middleware contract).
 */

import { NextRequest } from 'next/server';
import type { SessionUser } from '@/lib/auth';
import { getDemoGuardResponse, requireNotDemoViewer } from '@/lib/demoGuard';
import * as fs from 'fs';
import * as path from 'path';

function demoRequest(method: string, pathname: string): NextRequest {
  return {
    method,
    nextUrl: { pathname },
  } as unknown as NextRequest;
}

describe('getDemoGuardResponse', () => {
  const demoUser = {
    id: 'demo-1',
    empId: 'DEMO',
    role: 'DEMO_VIEWER' as const,
    boutiqueId: 'b1',
    disabled: false,
    mustChangePassword: false,
    canEditSchedule: false,
  } as SessionUser;

  it('allows GET requests for DEMO_VIEWER', () => {
    expect(getDemoGuardResponse(demoRequest('GET', '/api/sales/daily/lines'), demoUser)).toBeNull();
  });

  it('blocks POST mutations for DEMO_VIEWER', () => {
    const res = getDemoGuardResponse(demoRequest('POST', '/api/targets/import/boutiques/apply'), demoUser);
    expect(res?.status).toBe(403);
  });

  it('allows POST /api/auth/logout for DEMO_VIEWER', () => {
    expect(getDemoGuardResponse(demoRequest('POST', '/api/auth/logout'), demoUser)).toBeNull();
  });

  it('allows mutations for non-demo users', () => {
    const manager = { ...demoUser, role: 'MANAGER' as const };
    expect(getDemoGuardResponse(demoRequest('POST', '/api/sales/daily/lines'), manager)).toBeNull();
  });
});

describe('requireNotDemoViewer', () => {
  it('returns 403 when demo user mutates', async () => {
    const res = await requireNotDemoViewer(
      demoRequest('PATCH', '/api/admin/users'),
      async () =>
        ({
          id: 'demo-1',
          empId: 'DEMO',
          role: 'DEMO_VIEWER',
          boutiqueId: 'b1',
          disabled: false,
          mustChangePassword: false,
          canEditSchedule: false,
        }) as SessionUser
    );
    expect(res?.status).toBe(403);
  });
});

describe('middleware DEMO_VIEWER contract', () => {
  it('blocks DEMO_VIEWER API mutations before auth routes bypass', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf-8');
    expect(src).toContain("data.role === 'DEMO_VIEWER'");
    expect(src).toContain('Demo mode: read-only');
    expect(src).toMatch(/pathname !== DEMO_LOGOUT_PATH|DEMO_LOGOUT_PATH/);
    expect(src).toMatch(/before \/api\/auth bypass|before \/api\/auth/);
  });
});
