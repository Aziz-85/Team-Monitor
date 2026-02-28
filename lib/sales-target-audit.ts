import { prisma } from '@/lib/db';

const FALLBACK_BOUTIQUE_ID = 'bout_dhhrn_001';

async function getDefaultBoutiqueId(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'DEFAULT_BOUTIQUE_ID' },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return FALLBACK_BOUTIQUE_ID;
  try {
    const id = JSON.parse(row.valueJson) as string;
    return typeof id === 'string' ? id : FALLBACK_BOUTIQUE_ID;
  } catch {
    return FALLBACK_BOUTIQUE_ID;
  }
}

export type SalesTargetAuditAction =
  | 'GENERATE'
  | 'REGENERATE'
  | 'RESET'
  | 'OVERRIDE_EMPLOYEE'
  | 'SET_BOUTIQUE_TARGET'
  | 'CLEAR_BOUTIQUE_TARGET'
  | 'IMPORT_SALES'
  | 'CLEAR_SALES_MONTH';

export async function logSalesTargetAudit(
  monthKey: string,
  action: SalesTargetAuditAction,
  actorUserId: string,
  details: Record<string, unknown>,
  options?: { boutiqueId?: string }
): Promise<void> {
  try {
    const boutiqueId = options?.boutiqueId ?? (await getDefaultBoutiqueId());
    await prisma.salesTargetAudit.create({
      data: {
        boutiqueId,
        monthKey,
        action,
        actorUserId,
        detailsJson: details as object,
      },
    });
  } catch {
    // non-fatal
  }
}
