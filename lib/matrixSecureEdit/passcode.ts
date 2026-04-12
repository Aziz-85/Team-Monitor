import * as bcrypt from 'bcryptjs';

const ENV_KEY = 'MONTHLY_MATRIX_EDIT_PASSCODE_HASH';

export function isMonthlyMatrixEditPasscodeConfigured(): boolean {
  const h = process.env[ENV_KEY];
  return typeof h === 'string' && h.trim().length > 0;
}

export function getMonthlyMatrixEditPasscodeHashOrNull(): string | null {
  const h = process.env[ENV_KEY];
  if (typeof h !== 'string' || !h.trim()) return null;
  return h.trim();
}

/**
 * Verify plaintext passcode against bcrypt hash from env.
 * Returns false if env not set or compare fails (timing-safe via bcrypt).
 */
export async function verifyMonthlyMatrixEditPasscode(plain: string): Promise<boolean> {
  const hash = getMonthlyMatrixEditPasscodeHashOrNull();
  if (!hash || typeof plain !== 'string') return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
