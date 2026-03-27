import { formatSarInt } from '@/lib/utils/money';
import type { CompanyAlertItem } from '@/lib/company/types';

const SAR_KEYS = new Set(['paceDelta']);

/**
 * Interpolate `companyBackoffice.alertsMeta.*` templates using `useT` single-arg lookups.
 */
export function formatCompanyAlertMessage(template: string, alert: CompanyAlertItem): string {
  let s = template;
  for (const [k, raw] of Object.entries(alert.values)) {
    const display = SAR_KEYS.has(k) ? formatSarInt(Number(raw)) : String(raw);
    s = s.split(`{${k}}`).join(display);
  }
  return s;
}
