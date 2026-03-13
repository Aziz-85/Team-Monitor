/**
 * Compliance item status based on days remaining until expiry.
 * Expired: daysRemaining < 0
 * Urgent: daysRemaining <= 30
 * Warning: daysRemaining <= 60
 * OK: daysRemaining > 60
 */

export type ComplianceStatus = 'expired' | 'urgent' | 'warning' | 'ok';

export function getDaysRemaining(expiryDate: Date, today: Date = new Date()): number {
  const exp = new Date(expiryDate);
  exp.setUTCHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setUTCHours(0, 0, 0, 0);
  const diffMs = exp.getTime() - t.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function getComplianceStatus(daysRemaining: number): ComplianceStatus {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 30) return 'urgent';
  if (daysRemaining <= 60) return 'warning';
  return 'ok';
}
