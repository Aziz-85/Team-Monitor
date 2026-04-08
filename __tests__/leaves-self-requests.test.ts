/**
 * Leave request list API — self=true merges LeaveRequest (workflow) + Leave (admin schedule)
 * so employees see the same vacations as on the manager /leaves calendar view.
 */

function nextRequest(fullUrl: string): import('next/server').NextRequest {
  const u = new URL(fullUrl);
  return { url: u.href, nextUrl: u } as unknown as import('next/server').NextRequest;
}

describe('GET /api/leaves/requests', () => {
  const user = { id: 'user-u1', empId: 'EMP001', boutiqueId: 'boutique-b1' };

  const reqRow = {
    id: 'cr_req1',
    userId: user.id,
    boutiqueId: 'boutique-b1',
    startDate: new Date(Date.UTC(2026, 3, 6)),
    endDate: new Date(Date.UTC(2026, 3, 14)),
    type: 'OTHER',
    status: 'SUBMITTED',
    notes: null,
    createdAt: new Date(Date.UTC(2026, 3, 1)),
    user: { id: user.id, empId: user.empId, employee: { name: 'Test User' } },
    boutique: { id: 'boutique-b1', code: 'S02', name: 'AlRashid' },
    createdByUser: { empId: user.empId },
    approvedByUser: null,
    escalatedByUser: null,
  };

  const leaveRow = {
    id: 'cl_leave1',
    empId: user.empId,
    type: 'ANNUAL',
    status: 'APPROVED',
    startDate: new Date(Date.UTC(2026, 8, 1)),
    endDate: new Date(Date.UTC(2026, 8, 30)),
    notes: null,
    createdAt: new Date(Date.UTC(2026, 2, 1)),
    employee: {
      name: 'Test User',
      boutiqueId: 'boutique-b1',
      boutique: { id: 'boutique-b1', code: 'S02', name: 'AlRashid' },
    },
  };

  it('self=true: returns LeaveRequest rows with recordSource REQUEST and Leave rows as SCHEDULE, sorted by startDate desc', async () => {
    jest.resetModules();
    const leaveFindMany = jest.fn().mockResolvedValue([leaveRow]);
    const requestFindMany = jest.fn().mockResolvedValue([reqRow]);

    jest.doMock('@/lib/auth', () => ({ getSessionUser: jest.fn().mockResolvedValue(user) }));
    jest.doMock('@/lib/scope/requireOperationalBoutique', () => ({
      requireOperationalBoutique: jest.fn().mockResolvedValue({
        ok: true,
        boutiqueId: 'boutique-b1',
        boutiqueLabel: 'AlRashid',
      }),
    }));
    jest.doMock('@/lib/scope/resolveScope', () => ({
      getUserAllowedBoutiqueIds: jest.fn().mockResolvedValue(['boutique-b1']),
    }));
    jest.doMock('@/lib/db', () => ({
      prisma: {
        leaveRequest: { findMany: requestFindMany },
        leave: { findMany: leaveFindMany },
      },
    }));

    const { GET } = await import('@/app/api/leaves/requests/route');
    const res = await GET(nextRequest('http://localhost/api/leaves/requests?self=true'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      recordSource?: string;
      startDate: string;
    }>;

    expect(body).toHaveLength(2);
    const requestEntry = body.find((r) => r.recordSource === 'REQUEST');
    const scheduleEntry = body.find((r) => r.recordSource === 'SCHEDULE');
    expect(requestEntry?.id).toBe('cr_req1');
    expect(scheduleEntry?.id).toBe('schedule:cl_leave1');
    // September block before April block (desc by startDate)
    expect(body[0].id).toBe('schedule:cl_leave1');
    expect(body[1].id).toBe('cr_req1');
    expect(leaveFindMany).toHaveBeenCalled();
  });

  it('self=false: only LeaveRequest path; prisma.leave.findMany is not called', async () => {
    jest.resetModules();
    const leaveFindMany = jest.fn();
    jest.doMock('@/lib/auth', () => ({ getSessionUser: jest.fn().mockResolvedValue(user) }));
    jest.doMock('@/lib/scope/requireOperationalBoutique', () => ({
      requireOperationalBoutique: jest.fn().mockResolvedValue({
        ok: true,
        boutiqueId: 'boutique-b1',
        boutiqueLabel: 'AlRashid',
      }),
    }));
    jest.doMock('@/lib/scope/resolveScope', () => ({
      getUserAllowedBoutiqueIds: jest.fn(),
    }));
    jest.doMock('@/lib/db', () => ({
      prisma: {
        leaveRequest: { findMany: jest.fn().mockResolvedValue([{ ...reqRow, id: 'only' }]) },
        leave: { findMany: leaveFindMany },
      },
    }));

    const { GET } = await import('@/app/api/leaves/requests/route');
    const res = await GET(nextRequest('http://localhost/api/leaves/requests'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].recordSource).toBe('REQUEST');
    expect(leaveFindMany).not.toHaveBeenCalled();
  });
});
