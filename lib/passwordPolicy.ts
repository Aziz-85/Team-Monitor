/** Minimum password length for all password set/change flows. */
export const MIN_PASSWORD_LENGTH = 12;

const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password123',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty123',
    'admin123',
    'welcome123',
    'letmein123',
    'changeme123',
    'teammonitor',
    'dhahran123',
  ].map((p) => p.toLowerCase())
);

export type PasswordValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Enforce password strength: length, complexity, and block trivial passwords.
 * Returns a user-safe message (no internal details).
 */
export function validatePasswordStrength(
  password: string,
  context?: { empId?: string }
): PasswordValidationResult {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password.length > 128) {
    return { ok: false, message: 'Password is too long.' };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (!hasLower || !hasUpper || !hasDigit) {
    return {
      ok: false,
      message: 'Password must include uppercase, lowercase, and a number.',
    };
  }

  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return { ok: false, message: 'Password is too common. Choose a stronger password.' };
  }

  const empId = context?.empId?.trim().toLowerCase();
  if (empId && normalized.includes(empId)) {
    return { ok: false, message: 'Password must not contain your username.' };
  }

  return { ok: true };
}

/** Generic API error for password validation failures (no policy details leaked). */
export const GENERIC_PASSWORD_ERROR = 'Password does not meet security requirements.';
