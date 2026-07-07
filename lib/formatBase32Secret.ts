/** Format a Base32 TOTP secret for display (e.g. ABCD EFGH IJKL). */
export function formatBase32Secret(secret: string, groupSize = 4): string {
  const clean = secret.replace(/\s/g, '').toUpperCase();
  if (!clean) return '';
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += groupSize) {
    parts.push(clean.slice(i, i + groupSize));
  }
  return parts.join(' ');
}

/** Normalize secret for clipboard / manual entry (no spaces). */
export function normalizeBase32Secret(secret: string): string {
  return secret.replace(/\s/g, '').toUpperCase();
}
