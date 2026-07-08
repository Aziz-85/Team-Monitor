import { redirect } from 'next/navigation';

/**
 * Coverage Rules has been folded into Boutique Configuration (section D).
 * The legacy CoverageRule model and its API remain for backward compatibility.
 */
export default function LegacyCoverageRulesPage() {
  redirect('/admin/boutique-configuration');
}
