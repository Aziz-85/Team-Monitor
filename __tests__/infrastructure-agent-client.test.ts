describe('infrastructure agent client', () => {
  const original = process.env; const originalFetch = global.fetch;
  beforeEach(() => { jest.resetModules(); process.env = { ...original, INFRASTRUCTURE_AGENT_URL: 'http://127.0.0.1:4317', INFRASTRUCTURE_AGENT_TOKEN: 'x'.repeat(40), INFRASTRUCTURE_REQUEST_TIMEOUT_MS: '1000' }; });
  afterEach(() => { process.env = original; global.fetch = originalFetch; jest.useRealTimers(); });

  test('keeps the agent token server-side and accepts valid JSON', async () => {
    global.fetch = jest.fn().mockImplementation(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as typeof fetch;
    const { callInfrastructureAgent } = await import('@/lib/infrastructure/agentClient');
    expect(await callInfrastructureAgent('/health')).toEqual({ status: 'ok' });
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(JSON.stringify(await callInfrastructureAgent('/health'))).not.toContain('xxxx');
    expect((init.headers as Record<string, string>).authorization).toContain('Bearer ');
  });

  test('maps unavailable and malformed responses to safe error codes', async () => {
    const { callInfrastructureAgent, InfrastructureAgentError } = await import('@/lib/infrastructure/agentClient');
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as typeof fetch;
    await expect(callInfrastructureAgent('/health')).rejects.toMatchObject({ code: 'UNAVAILABLE' } satisfies Partial<InstanceType<typeof InfrastructureAgentError>>);
    global.fetch = jest.fn().mockResolvedValue(new Response('not-json', { status: 200 })) as typeof fetch;
    await expect(callInfrastructureAgent('/health')).rejects.toMatchObject({ code: 'MALFORMED' });
  });

  test('rejects non-loopback agent URLs', async () => {
    process.env.INFRASTRUCTURE_AGENT_URL = 'https://public.example'; jest.resetModules();
    const { callInfrastructureAgent } = await import('@/lib/infrastructure/agentClient');
    await expect(callInfrastructureAgent('/health')).rejects.toMatchObject({ code: 'DISABLED' });
  });
});
