/**
 * Central authentication step policy (Release 1+).
 * Decides next required step without weakening existing password / TOTP / lockout rules.
 */

import type { Role } from '@prisma/client';
import { roleRequires2FA } from '@/lib/twoFactor';
import {
  isPasskeysEnabled,
  isPushApprovalEnabled,
  isTrustedDevicesEnabled,
} from '@/lib/auth/authFeatureFlags';

export type RequiredAuthStep =
  | 'PASSWORD'
  | 'TOTP'
  | 'PASSKEY'
  | 'PUSH_APPROVAL'
  | 'RECOVERY'
  | 'COMPLETE';

export type AuthenticationDecision = {
  nextStep: RequiredAuthStep;
  reason: string;
  trustedDeviceAccepted: boolean;
  allowedFallbacks: RequiredAuthStep[];
};

export type AuthenticationPolicyInput = {
  role: Role;
  passwordVerified: boolean;
  trustedDeviceValid: boolean;
  hasPasskeys: boolean;
  hasAuthenticatorDevice: boolean;
  totpEnabled: boolean;
  /** Sensitive step-up (settings mutations) — trusted device alone is not enough. */
  requiresStrongStepUp?: boolean;
};

/**
 * After password verification, decide the next second-factor step.
 * Employee / roles without 2FA → COMPLETE (password alone).
 */
export function decidePostPasswordAuthStep(input: AuthenticationPolicyInput): AuthenticationDecision {
  if (!input.passwordVerified) {
    return {
      nextStep: 'PASSWORD',
      reason: 'password_required',
      trustedDeviceAccepted: false,
      allowedFallbacks: [],
    };
  }

  if (!roleRequires2FA(input.role)) {
    return {
      nextStep: 'COMPLETE',
      reason: 'role_no_2fa',
      trustedDeviceAccepted: false,
      allowedFallbacks: [],
    };
  }

  if (input.requiresStrongStepUp) {
    return decideStrongStepUp(input);
  }

  if (isTrustedDevicesEnabled() && input.trustedDeviceValid) {
    return {
      nextStep: 'COMPLETE',
      reason: 'trusted_device',
      trustedDeviceAccepted: true,
      allowedFallbacks: [],
    };
  }

  const fallbacks: RequiredAuthStep[] = [];
  if (input.totpEnabled) fallbacks.push('TOTP');
  if (isPasskeysEnabled() && input.hasPasskeys) fallbacks.push('PASSKEY');
  if (isPushApprovalEnabled() && input.hasAuthenticatorDevice) fallbacks.push('PUSH_APPROVAL');

  // Release 1: prefer TOTP; later releases reorder via flags + registrations.
  if (isPasskeysEnabled() && input.hasPasskeys) {
    return {
      nextStep: 'PASSKEY',
      reason: 'prefer_passkey',
      trustedDeviceAccepted: false,
      allowedFallbacks: fallbacks.filter((s) => s !== 'PASSKEY'),
    };
  }

  if (isPushApprovalEnabled() && input.hasAuthenticatorDevice) {
    return {
      nextStep: 'PUSH_APPROVAL',
      reason: 'prefer_push_approval',
      trustedDeviceAccepted: false,
      allowedFallbacks: fallbacks.filter((s) => s !== 'PUSH_APPROVAL'),
    };
  }

  return {
    nextStep: 'TOTP',
    reason: input.totpEnabled ? 'totp_required' : 'totp_setup_required',
    trustedDeviceAccepted: false,
    allowedFallbacks: fallbacks.filter((s) => s !== 'TOTP'),
  };
}

function decideStrongStepUp(input: AuthenticationPolicyInput): AuthenticationDecision {
  const fallbacks: RequiredAuthStep[] = [];
  if (input.totpEnabled) fallbacks.push('TOTP');
  if (isPasskeysEnabled() && input.hasPasskeys) fallbacks.push('PASSKEY');
  if (isPushApprovalEnabled() && input.hasAuthenticatorDevice) fallbacks.push('PUSH_APPROVAL');

  if (isPasskeysEnabled() && input.hasPasskeys) {
    return {
      nextStep: 'PASSKEY',
      reason: 'strong_step_up_passkey',
      trustedDeviceAccepted: false,
      allowedFallbacks: fallbacks.filter((s) => s !== 'PASSKEY'),
    };
  }
  if (isPushApprovalEnabled() && input.hasAuthenticatorDevice) {
    return {
      nextStep: 'PUSH_APPROVAL',
      reason: 'strong_step_up_push',
      trustedDeviceAccepted: false,
      allowedFallbacks: fallbacks.filter((s) => s !== 'PUSH_APPROVAL'),
    };
  }
  return {
    nextStep: 'TOTP',
    reason: 'strong_step_up_totp',
    trustedDeviceAccepted: false,
    allowedFallbacks: fallbacks.filter((s) => s !== 'TOTP'),
  };
}

/** Suggested freshness window for sensitive security mutations. */
export const RECENT_STRONG_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

export type RecentStrongAuthState = {
  ok: boolean;
  reason: string;
};

/**
 * Placeholder for Release 2+: check a short-lived strong-auth marker on the session.
 * Release 1 returns false so callers keep requiring fresh TOTP where already enforced.
 */
export function requireRecentStrongAuth(lastStrongAuthAt: Date | null | undefined): RecentStrongAuthState {
  if (!lastStrongAuthAt) {
    return { ok: false, reason: 'no_recent_strong_auth' };
  }
  const age = Date.now() - lastStrongAuthAt.getTime();
  if (age > RECENT_STRONG_AUTH_MAX_AGE_MS) {
    return { ok: false, reason: 'strong_auth_stale' };
  }
  return { ok: true, reason: 'strong_auth_fresh' };
}
