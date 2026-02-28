export function getFirstName(fullName: string | null | undefined): string {
  const raw = (fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  const cleaned = raw.replace(/^(mr|mrs|ms|dr|eng)\.?\s+/i, '');
  return cleaned.split(' ')[0] ?? '';
}
