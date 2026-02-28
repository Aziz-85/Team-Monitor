/**
 * Shared coverage header label for schedule view/edit.
 * Single source for "Rashid Coverage" | "${BoutiqueName} Coverage" | "External Coverage".
 */

export type GuestForCoverageLabel = {
  sourceBoutique?: { name: string } | null;
  employee: { homeBoutiqueName?: string };
};

const DEFAULT_RASHID = 'Rashid Coverage';
const DEFAULT_EXTERNAL = 'External Coverage';

/**
 * Compute the coverage column header label from external guest list.
 * - No guests → "Rashid Coverage"
 * - One source boutique → "${name} Coverage"
 * - Multiple sources → "External Coverage"
 */
export function getCoverageHeaderLabel(
  externalGuests: GuestForCoverageLabel[],
  options: {
    rashidLabel?: string;
    externalLabel?: string;
  } = {}
): string {
  const rashidLabel = options.rashidLabel ?? DEFAULT_RASHID;
  const externalLabel = options.externalLabel ?? DEFAULT_EXTERNAL;

  if (externalGuests.length === 0) return rashidLabel;

  const uniqueNames = Array.from(
    new Set(
      externalGuests.map(
        (g) => g.sourceBoutique?.name ?? g.employee.homeBoutiqueName ?? 'External'
      )
    )
  ) as string[];
  if (uniqueNames.length === 1) return `${uniqueNames[0]} Coverage`;
  return externalLabel;
}
