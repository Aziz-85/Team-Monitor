import { validatePasswordStrength } from '@/lib/passwordPolicy';
import { generateTotpSecret, encryptTotpSecret, decryptTotpSecret } from '@/lib/totp';

describe('passwordPolicy', () => {
  it('rejects short passwords', () => {
    const r = validatePasswordStrength('Ab1');
    expect(r.ok).toBe(false);
  });

  it('rejects passwords without complexity', () => {
    const r = validatePasswordStrength('longpasswordonly');
    expect(r.ok).toBe(false);
  });

  it('accepts strong passwords', () => {
    const r = validatePasswordStrength('Boutique#2026Safe');
    expect(r.ok).toBe(true);
  });

  it('rejects password containing empId', () => {
    const r = validatePasswordStrength('admin_dhahranX1A', { empId: 'admin_dhahran' });
    expect(r.ok).toBe(false);
  });
});

describe('totp', () => {
  it('encrypts and decrypts secrets', () => {
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(secret);
    expect(decryptTotpSecret(enc)).toBe(secret);
  });
});
