/**
 * Multi-boutique scope types. Phase 2.
 * Policy: Region/Group views ONLY for ADMIN + MANAGER.
 */

export type ScopeKind = 'BOUTIQUE' | 'REGION' | 'GROUP' | 'SELECTION';

export type ScopeSelectionJson = {
  scope: ScopeKind;
  boutiqueId?: string;
  regionId?: string;
  groupId?: string;
  boutiqueIds?: string[];
};

export type ResolvedScope = {
  scope: ScopeKind;
  /** Single selected boutique for operational pages. Use this for all filters. */
  boutiqueId: string;
  /** All allowed boutique IDs (from memberships). Used for validation only, not for combined data. */
  boutiqueIds: string[];
  label: string;
};
