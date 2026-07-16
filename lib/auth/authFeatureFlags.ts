/**
 * Auth feature flags — incremental modern authentication rollout.
 * Do not enable later phases by default.
 */

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return defaultValue;
}

export function isTrustedDevicesEnabled(): boolean {
  return envFlag('AUTH_TRUSTED_DEVICES_ENABLED', false);
}

export function isPasskeysEnabled(): boolean {
  return envFlag('AUTH_PASSKEYS_ENABLED', false);
}

export function isPushApprovalEnabled(): boolean {
  return envFlag('AUTH_PUSH_APPROVAL_ENABLED', false);
}

export function isPasswordlessPasskeyEnabled(): boolean {
  return envFlag('AUTH_PASSWORDLESS_PASSKEY_ENABLED', false);
}

/** Trusted-device cookie lifetime defaults (days). */
export const TRUSTED_DEVICE_DEFAULT_DAYS = 30;
export const TRUSTED_DEVICE_MAX_DAYS = 90;
