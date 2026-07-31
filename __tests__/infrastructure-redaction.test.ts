import { redactSecrets } from '@/services/infrastructure-agent/redact';

describe('infrastructure log redaction', () => {
  test.each([
    'DATABASE_URL=postgresql://user:secret@example/db', 'password=hunter2', 'token=abc123',
    'Authorization: Bearer ey.secret.value', 'cookie=session-secret', 'api_key=topsecret',
  ])('redacts secret-bearing log line: %s', (line) => {
    const output = redactSecrets(line); expect(output).toContain('[REDACTED]');
    expect(output).not.toMatch(/secret|hunter2|abc123|topsecret|ey\.secret\.value|session-secret/i);
  });

  test('does not append the original input after bearer replacement', () => {
    expect(redactSecrets('Authorization: Bearer private-value')).toBe('Authorization: [REDACTED]');
  });
});
