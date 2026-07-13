/** Unified server-side authorization facade. */

export {
  BoutiqueAuthorizationError,
  checkBoutiqueAccess,
  checkBoutiquePermission,
  hasCrossBoutiqueAdminBypass,
  hasExplicitPlatformAccess,
  requireBoutiqueAccess,
  requireBoutiquePermission,
  type BoutiqueAccessResult,
  type BoutiqueAccessUser,
} from '@/lib/permissions/boutiqueAccess';

export {
  canManageInBoutique,
  canManageLeavesInBoutique,
  canManageSalesInBoutique,
  canManageTasksInAny,
  getMembership,
  type MembershipPermission,
} from '@/lib/membershipPermissions';

export {
  checkSalesEntryImportBatchAccess,
  type ResourceAccessResult,
} from '@/lib/permissions/resourceAccess';
