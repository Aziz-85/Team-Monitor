/**
 * Shared coverage header label for schedule view/edit.
 * Dynamic by host boutique: never "Rashid Coverage" when host is AlRashid; use "External Coverage" (or "Coverage from X" when showing a specific source).
 */

export type GuestForCoverageLabel = {
  sourceBoutique?: { name: string; id?: string } | null;
  employee: { homeBoutiqueName?: string };
};

export type GetCoverageColumnLabelOptions = {
  /** Current host / "Working on" boutique (schedule scope) */
  hostBoutique?: { id?: string; name?: string } | null;
  /** i18n or fallback for generic external coverage */
  externalLabel?: string;
};

const DEFAULT_EXTERNAL = 'External Coverage';

/**
 * Compute the coverage column header label.
 * - No guests → externalLabel (default "External Coverage"); never "Rashid Coverage" so label is correct when host is AlRashid.
 * - One source boutique (and source !== host) → "Coverage from {name}" or "{name} Coverage"
 * - Multiple sources or source === host → externalLabel
 */
export function getCoverageHeaderLabel(
  externalGuests: GuestForCoverageLabel[],
  options: GetCoverageColumnLabelOptions & { externalLabel?: string } = {}
): string {
  const externalLabel = options.externalLabel ?? DEFAULT_EXTERNAL;
  const hostBoutique = options.hostBoutique;

  if (externalGuests.length === 0) return externalLabel;

  const uniqueSources = Array.from(
    new Set(
      externalGuests.map(
        (g) => g.sourceBoutique?.name ?? g.employee.homeBoutiqueName ?? 'External'
      )
    )
  ) as string[];
  if (uniqueSources.length === 1) {
    const name = uniqueSources[0];
    const hostName = hostBoutique?.name?.trim();
    if (hostName && name === hostName) return externalLabel;
    return `${name} Coverage`;
  }
  return externalLabel;
}
