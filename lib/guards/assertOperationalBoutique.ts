/**
 * Dev-time guard for operational boutique isolation.
 * Throws in development when operationalBoutiqueId is missing.
 */

export function assertOperationalBoutiqueId(boutiqueId: string | null | undefined): asserts boutiqueId is string {
  if (process.env.NODE_ENV === 'development' && (!boutiqueId || boutiqueId === '')) {
    throw new Error(
      '[assertOperationalBoutique] Operational boutique ID is required. ' +
        'Operational APIs must resolve and use operationalBoutiqueId.'
    );
  }
}
